import { History, demoDocument, emptyDocument, createPoint, base, evaluate, isFreePoint, refs, cascadeIds, movablePoints, translate, worldToScreen, screenToWorld, validateDocument, COLORS } from './model.ts';
import type { Document as MathDocument, MathObject, Point, Line, Polygon, Circle, Position, Evaluation } from './model.ts';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = document.getElementById('canvas') as unknown as SVGSVGElement;
const storageKey = 'euclidraw.document.v1';
const names = { point: '점', segment: '선분', line: '직선', vector: '벡터', polygon: '다각형', circle: '원' };
const icons = { point: '•', segment: '╱', line: '⟷', vector: '↗', polygon: '△', circle: '○' };
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
const number = (n: number, precision = 3) => Number(n.toFixed(precision)).toString();
let recoveryMessage = '';
let restored: MathDocument;
try {
  const saved = localStorage.getItem(storageKey);
  restored = saved ? validateDocument(JSON.parse(saved)) : demoDocument();
} catch {
  restored = demoDocument();
  recoveryMessage = '자동 저장 자료를 열 수 없어 예제를 표시했습니다. 원래 자료는 덮어쓰지 않았습니다.';
}
const history = new History(restored);
let selected = new Set<string>();
let tool = 'select';
let construction: string[] = [];
let spaceHeld = false;
let dimensions: Position = [800, 600];
let drag: { previous: MathDocument; start: Position; ids: Set<string>; pan: boolean; pointerId: number } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let storageWritable = !recoveryMessage;

function status(message: string) { $('status').textContent = message; }
function error(message: string) {
  $('error-message').textContent = message;
  const dialog = $('error-dialog') as HTMLDialogElement;
  if (!dialog.open) dialog.showModal();
}
async function confirmAction(title: string, message: string): Promise<boolean> {
  const dialog = $('confirm-dialog') as HTMLDialogElement;
  if (dialog.open) return false;
  $('confirm-title').textContent = title; $('confirm-message').textContent = message;
  return new Promise(resolve => {
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
  });
}
function saveLocal(immediate = false) {
  if (!storageWritable) return;
  if (saveTimer) clearTimeout(saveTimer);
  const save = () => {
    saveTimer = null;
    try { localStorage.setItem(storageKey, JSON.stringify(drag?.previous ?? history.document)); $('save-state').textContent = '이 브라우저에 자동 저장됨'; }
    catch { $('save-state').textContent = '자동 저장 불가 · 파일 저장을 이용하세요'; }
  };
  if (immediate) save(); else { $('save-state').textContent = '저장 중…'; saveTimer = setTimeout(save, 250); }
}
function commit(next: MathDocument, previous = history.document) {
  history.commit(next, previous);
  selected = new Set([...selected].filter(id => history.document.objects.some(o => o.id === id)));
  render(); saveLocal();
}
function current(): MathObject | undefined { return selected.size === 1 ? history.document.objects.find(o => selected.has(o.id)) : undefined; }
function selection(id: string | null, additive = false) {
  if (!additive) selected.clear();
  if (id) { if (additive && selected.has(id)) selected.delete(id); else selected.add(id); }
  render();
}
function setTool(next: string) {
  cancelDrag(); tool = next; construction = [];
  svg.dataset.tool = tool;
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => { const active = button.dataset.tool === tool; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  const hints: Record<string, string> = {
    select: '점을 드래그하면 연결된 도형과 중점도 함께 움직입니다. Shift+클릭으로 여러 객체를 선택하세요.',
    pan: '캔버스를 드래그해 화면을 이동하세요. 휠로 확대·축소할 수 있습니다.',
    point: '캔버스를 클릭해 점을 추가하세요. 오른쪽에서 좌표를 직접 입력할 수도 있습니다.',
    segment: '선분의 시작점과 끝점을 차례로 선택하세요.', line: '직선을 지나는 점 두 개를 선택하세요.',
    vector: '벡터의 시작점과 끝점을 차례로 선택하세요.', polygon: '삼각형의 꼭짓점 세 개를 선택하세요.',
    midpoint: '중점을 만들 두 점을 선택하세요. 중점은 원래 점을 따라 움직입니다.',
    circle: '중심점을 선택한 뒤 캔버스를 클릭해 반지름을 정하세요.'
  };
  status(hints[next]); renderCanvas();
}
function nextPointName(): string {
  const used = new Set(history.document.objects.map(o => o.name));
  for (let i = 0; i < 10000; i++) {
    const label = i < 26 ? String.fromCharCode(65+i) : `P${i-25}`;
    if (!used.has(label)) return label;
  }
  return 'P';
}
function addObjects(objects: MathObject[]) {
  const next = structuredClone(history.document); next.objects.push(...objects);
  const valid = validateDocument(next);
  selected = new Set([objects[objects.length-1].id]); commit(valid);
}
function pointAtEvent(event: PointerEvent): string | undefined {
  const target = (event.target as Element).closest('[data-object]');
  const o = target ? history.document.objects.find(o => o.id === target.getAttribute('data-object')) : undefined;
  if (o?.type === 'point' && !o.hidden) return o.id;
  const pointer = localPoint(event);
  const evals = evaluate(history.document);
  return [...history.document.objects].reverse().find(o => {
    const p = o.type === 'point' && !o.hidden ? evals.get(o.id)?.points[0] : undefined;
    if (!p) return false;
    const q = worldToScreen(p, history.document.viewport, ...dimensions);
    return Math.hypot(q[0]-pointer[0],q[1]-pointer[1]) < 14;
  })?.id;
}
function localPoint(event: { clientX: number; clientY: number }): Position {
  const rect = svg.getBoundingClientRect(); return [event.clientX-rect.left,event.clientY-rect.top];
}
function snapped(p: Position): Position { return history.document.snap ? [Math.round(p[0]*2)/2,Math.round(p[1]*2)/2] : p; }
function constructionClick(event: PointerEvent) {
  const p = snapped(screenToWorld(localPoint(event), history.document.viewport, ...dimensions));
  if (tool === 'point') { addObjects([createPoint(nextPointName(),p)]); status('점을 추가했습니다. 좌표를 입력하거나 드래그해 움직여 보세요.'); return; }
  if (tool === 'circle' && construction.length === 1) {
    const centerId = construction[0], center = evaluate(history.document).get(centerId)?.points[0];
    if (!center) { construction=[]; return; }
    const radius = Math.hypot(p[0]-center[0],p[1]-center[1]);
    if(radius <= 0 || radius > 10000) { status('반지름은 0보다 크고 10000 이하여야 합니다. 다른 위치를 클릭하세요.'); return; }
    const circle: Circle = { ...base('circle', `원 ${history.document.objects.filter(o=>o.type==='circle').length+1}`,COLORS[1]), type:'circle', definition:{center:centerId,radius} };
    addObjects([circle]); construction=[]; status('원을 추가했습니다. 속성에서 반지름을 정확히 입력할 수 있습니다.'); return;
  }
  const id = pointAtEvent(event);
  if(!id) { status('먼저 점 도구로 점을 만들고, 연결할 점을 선택하세요.'); return; }
  if(construction.includes(id)) { status('서로 다른 점을 선택하세요. Esc로 취소할 수 있습니다.'); return; }
  construction.push(id);
  const count = tool === 'polygon' ? 3 : tool === 'circle' ? 1 : 2;
  if(construction.length < count) { status(`${construction.length}개 선택됨 · 다음 점을 선택하세요. Esc로 취소합니다.`); renderCanvas(); return; }
  if(tool === 'circle') { status('캔버스를 클릭해 원의 반지름을 정하세요.'); renderCanvas(); return; }
  const map = new Map(history.document.objects.map(o=>[o.id,o.name]));
  let o: MathObject;
  if(tool === 'midpoint') o={...base('point',`M${history.document.objects.filter(o=>o.type==='point'&&!isFreePoint(o)).length+1}`,COLORS[2]),type:'point',definition:{rule:'midpoint',inputs:[construction[0],construction[1]]}};
  else if(tool === 'polygon') o={...base('polygon',`삼각형 ${construction.map(id=>map.get(id)).join('')}`),type:'polygon',definition:{points:[...construction]}};
  else o={...base(tool as Line['type'],`${names[tool as Line['type']]} ${construction.map(id=>map.get(id)).join('')}`,tool==='vector'?COLORS[1]:COLORS[0]),type:tool as Line['type'],definition:{points:[construction[0],construction[1]]}};
  addObjects([o]); construction=[]; status(`${o.name}을 추가했습니다. 계속 만들거나 선택 도구로 돌아가세요.`);
}
function svgElement(tag: string, attributes: Record<string, unknown> = {}): SVGElement {
  const e = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [key,value] of Object.entries(attributes)) e.setAttribute(key,String(value));
  return e;
}
function renderCanvas() {
  const d = history.document, values = evaluate(d), [w,h] = dimensions;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.replaceChildren();
  const defs = svgElement('defs');
  const arrow = svgElement('marker',{id:'vector-arrow',markerWidth:8,markerHeight:8,refX:7,refY:4,orient:'auto',markerUnits:'strokeWidth'});
  arrow.append(svgElement('path',{d:'M 0 0 L 8 4 L 0 8 z',fill:'context-stroke'})); defs.append(arrow); svg.append(defs);
  if(d.grid) renderGrid();
  const screen = (p:Position)=>worldToScreen(p,d.viewport,w,h);
  const nonpoints=d.objects.filter(o=>o.type!=='point'),points=d.objects.filter(o=>o.type==='point');
  for(const o of [...nonpoints,...points]) {
    if(o.hidden) continue;
    const v=values.get(o.id)!;if(!v.points.length) continue;
    if(!v.valid && o.type!=='polygon') continue;
    const active=selected.has(o.id)||construction.includes(o.id);
    const group=svgElement('g',{'data-object':o.id,'data-kind':o.type,'data-name':o.name,class:'object-group',role:'button','aria-label':`${o.name} ${names[o.type]}`});
    const title=svgElement('title');title.textContent=o.name;group.append(title);
    let label:Position;
    if(o.type==='point') {
      const p=screen(v.points[0]);label=[p[0]+12,p[1]-13];
      if(active)group.append(svgElement('circle',{cx:p[0],cy:p[1],r:12,fill:o.style.color+'14',stroke:o.style.color,'stroke-width':1.3,class:'selection-halo'}));
      group.append(svgElement('circle',{cx:p[0],cy:p[1],r:14,fill:'transparent',class:'hit-target','data-hit':'true'}));
      group.append(svgElement('circle',{cx:p[0],cy:p[1],r:5.5,fill:isFreePoint(o)?o.style.color:'#fafaff',stroke:o.style.color,'stroke-width':2.2}));
      if(o.style.labelVisible) {
        const name=svgElement('text',{x:label[0],y:label[1],fill:o.style.color,'font-size':18,class:'point-label'});name.textContent=o.name;group.append(name);
        const coords=svgElement('text',{x:label[0]+Math.max(14,o.name.length*10),y:label[1]+1,fill:'#9890ac','font-size':10});coords.textContent=`(${number(v.points[0][0],2)}, ${number(v.points[0][1],2)})`;group.append(coords);
      }
    } else {
      const ps=v.points.map(screen);
      let tag:string,attrs:Record<string,unknown>;
      if(o.type==='circle') {
        tag='circle';attrs={cx:ps[0][0],cy:ps[0][1],r:o.definition.radius*d.viewport.pixelsPerUnit};
        label=[ps[0][0]+o.definition.radius*d.viewport.pixelsPerUnit+10,ps[0][1]];
      } else if(o.type==='polygon') {
        tag='polygon';attrs={points:ps.map(p=>p.join(',')).join(' ')};
        label=[ps.reduce((a,p)=>a+p[0],0)/ps.length,ps.reduce((a,p)=>a+p[1],0)/ps.length];
      } else {
        let [a,b]=ps;
        if(o.type==='line') {
          const dx=b[0]-a[0],dy=b[1]-a[1],amount=(Math.hypot(w,h)+Math.hypot(...a)+Math.hypot(...b))/Math.hypot(dx,dy);
          a=[a[0]-dx*amount,a[1]-dy*amount];b=[b[0]+dx*amount,b[1]+dy*amount];
        }
        tag='line';attrs={x1:a[0],y1:a[1],x2:b[0],y2:b[1]};
        label=[(ps[0][0]+ps[1][0])/2,(ps[0][1]+ps[1][1])/2-12];
      }
      const fill=o.type==='polygon'||o.type==='circle'?o.style.color+'0c':'none';
      if(active)group.append(svgElement(tag,{...attrs,fill:'none',stroke:o.style.color+'40','stroke-width':o.style.width+7,class:'selection-halo'}));
      group.append(svgElement(tag,{...attrs,fill,stroke:v.valid?o.style.color:'#be5a69','stroke-width':o.style.width,'stroke-linecap':'round','stroke-linejoin':'round',...(o.type==='vector'?{'marker-end':'url(#vector-arrow)'}:{})}));
      group.append(svgElement(tag,{...attrs,fill:o.type==='polygon'||o.type==='circle'?'transparent':'none',stroke:'transparent','stroke-width':16,class:'hit-target','data-hit':'true'}));
      if(o.style.labelVisible) {
        const text=svgElement('text',{x:label[0],y:label[1],'text-anchor':o.type==='polygon'?'middle':'start',class:'object-label'});
        text.textContent=o.type==='polygon'?`넓이 ${v.valid?number(v.area!):'미정의'}`:o.type==='circle'?`r = ${number(v.radius!)}`:o.name;
        group.append(text);
      }
    }
    svg.append(group);
  }
  $('reset-view').textContent = `${Math.round(d.viewport.pixelsPerUnit/65*100)}%`;
  ($('grid') as HTMLInputElement).checked=d.grid; ($('snap') as HTMLInputElement).checked=d.snap;
}
function renderGrid() {
  const d=history.document,[w,h]=dimensions;
  const low=screenToWorld([0,h],d.viewport,w,h),high=screenToWorld([w,0],d.viewport,w,h);
  const step=2**Math.ceil(Math.log2(42/d.viewport.pixelsPerUnit));
  const g=svgElement('g',{'data-grid':'true','pointer-events':'none'});
  for(let x=Math.ceil(low[0]/step)*step;x<=high[0]+step*.0001;x+=step) {
    const p=worldToScreen([x,0],d.viewport,w,h);
    g.append(svgElement('line',{x1:p[0],y1:0,x2:p[0],y2:h,stroke:Math.abs(x)<1e-8?'#bcb6ce':'#eceaf4','stroke-width':Math.abs(x)<1e-8?1.2:.8}));
    if(Math.abs(x)>1e-8){const label=svgElement('text',{x:p[0]+5,y:Math.max(96,Math.min(h-70,p[1]+16)),class:'grid-label'});label.textContent=number(x,2);g.append(label);}
  }
  for(let y=Math.ceil(low[1]/step)*step;y<=high[1]+step*.0001;y+=step) {
    const p=worldToScreen([0,y],d.viewport,w,h);
    g.append(svgElement('line',{x1:0,y1:p[1],x2:w,y2:p[1],stroke:Math.abs(y)<1e-8?'#bcb6ce':'#eceaf4','stroke-width':Math.abs(y)<1e-8?1.2:.8}));
    if(Math.abs(y)>1e-8){const label=svgElement('text',{x:Math.max(8,Math.min(w-30,p[0]+7)),y:p[1]-7,class:'grid-label'});label.textContent=number(y,2);g.append(label);}
  }
  svg.append(g);
}
function renderList() {
  $('objects').replaceChildren(); $('object-count').textContent=String(history.document.objects.length);
  for(const o of history.document.objects) {
    const row=document.createElement('button');row.className='object-row'+(selected.has(o.id)?' selected':'');row.dataset.listObject=o.id;
    row.setAttribute('aria-label',`${o.name} 선택`);row.setAttribute('aria-pressed',String(selected.has(o.id)));
    row.innerHTML=`<span class="object-icon" style="color:${o.style.color}">${icons[o.type]}</span><span class="object-name">${esc(o.name)}</span><span class="relation-mark">${o.hidden?'숨김':o.locked?'잠금':o.type==='point'&&!isFreePoint(o)?'관계':''}</span>`;
    row.onclick=event=>{construction=[];selection(o.id,event.shiftKey);};$('objects').append(row);
  }
}
function field(key:string,label:string,value:unknown,extra='') { return `<label class="field" for="prop-${key}">${label}</label><input id="prop-${key}" name="${key}" value="${esc(value)}" ${extra}>`; }
function renderInspector() {
  const inspector=$('inspector'),o=current(),values=evaluate(history.document);
  if(!o) {
    inspector.innerHTML=selected.size ? `<div class="empty-glyph">↖</div><h2>${selected.size}개 선택</h2><p class="intro">함께 움직이거나 삭제할 수 있습니다. 공유하는 점은 한 번만 이동합니다.</p><button id="delete-selection" class="danger">선택한 객체 삭제</button>` : `<div class="empty-glyph">⌖</div><h2>설명의 시작은<br>하나의 점에서.</h2><p class="intro">캔버스의 점이나 도형을 선택하면<br>좌표와 관계를 수정할 수 있습니다.</p><div class="property-divider"></div><span class="type-tag">좌표로 점 만들기</span><form id="point-form">${field('name','점 이름',nextPointName(),'maxlength="100"')}<div class="two-cols"><div>${field('x','X','0','type="number" step="any" required')}</div><div>${field('y','Y','0','type="number" step="any" required')}</div></div><div class="inspector-actions"><button class="primary" type="submit">점 추가</button></div></form><p class="small-note">수학 좌표는 오른쪽이 +X, 위쪽이 +Y입니다. 스냅은 0.5 단위입니다.</p>`;
    $('delete-selection')?.addEventListener('click',()=>deleteSelection());
    $('point-form')?.addEventListener('submit',event=>{
      event.preventDefault();
      try{const name=($('prop-name') as HTMLInputElement).value.trim()||nextPointName();const x=parseNumber('prop-x'),y=parseNumber('prop-y');addObjects([createPoint(name,[x,y])]);status('입력한 좌표에 점을 만들었습니다.');}
      catch(e){error((e as Error).message);}
    });return;
  }
  const v=values.get(o.id)!;
  const referenceNames=refs(o).map(id=>history.document.objects.find(o=>o.id===id)?.name||'?');
  const derived=o.type==='point'&&!isFreePoint(o);
  let coordinates='';
  if(o.type==='point'&&v.points[0]) coordinates=`<div class="two-cols"><div>${field('x','X',number(v.points[0][0],6),`type="number" step="any" ${derived?'disabled':''}`)}</div><div>${field('y','Y',number(v.points[0][1],6),`type="number" step="any" ${derived?'disabled':''}`)}</div></div>`;
  if(o.type==='circle') coordinates=field('radius','반지름',o.definition.radius,'type="number" min="0.000001" max="10000" step="any"');
  let relation='';
  if(derived) relation=`<div class="relation-card"><strong>중점 관계</strong><br>${esc(referenceNames.join('와 '))}의 중점입니다.<br>원래 점을 움직이면 좌표가 갱신됩니다.</div>`;
  else if(referenceNames.length) relation=`<div class="relation-card"><strong>${o.type==='circle'?'중심점':'참조하는 점'}</strong><br>${esc(referenceNames.join(' · '))}<br>점을 선택해 꼭짓점 좌표를 수정하세요.</div>`;
  const measurements=`${v.length!==undefined?`<div class="measure"><span>두 점 사이 거리</span><strong>${number(v.length)} 단위</strong></div>`:''}${v.area!==undefined?`<div class="measure"><span>넓이</span><strong>${number(v.area)} 단위²</strong></div>`:''}${o.type==='vector'?`<div class="measure"><span>벡터 성분</span><strong>(${number(v.points[1][0]-v.points[0][0])}, ${number(v.points[1][1]-v.points[0][1])})</strong></div>`:''}`;
  inspector.innerHTML=`<span class="type-tag">${derived?'종속된 점':names[o.type]}</span><h2>${esc(o.name)}</h2><form id="properties">${field('name','객체 이름',o.name,'maxlength="100"')}${coordinates}${relation}${measurements}${!v.valid?`<p class="small-note">${esc(v.reason)}</p>`:''}<div class="property-divider"></div><label class="field" for="prop-color">선과 점의 색상</label><div class="swatches">${COLORS.map(c=>`<button type="button" class="swatch ${c===o.style.color?'active':''}" style="background:${c}" data-color="${c}" aria-label="색상 ${c}"></button>`).join('')}</div><input id="prop-color" type="color" value="${o.style.color}" style="width:100%;height:30px">${field('width','선 두께',o.style.width,'type="number" min="0.5" max="12" step="0.5"')}<label class="inline-check"><input id="prop-label" type="checkbox" ${o.style.labelVisible?'checked':''}>이름과 수치 표시</label><label class="inline-check"><input id="prop-locked" type="checkbox" ${o.locked?'checked':''}>이동 잠금</label><label class="inline-check"><input id="prop-hidden" type="checkbox" ${o.hidden?'checked':''}>캔버스에서 숨김</label><div class="inspector-actions"><button class="primary" type="submit">변경 적용</button><button class="danger" id="delete-selection" type="button">삭제</button></div></form><p class="small-note">${derived?'종속된 점은 직접 이동하지 않습니다.':'도형을 옮기면 참조하는 자유점도 이동합니다. 공유하는 도형의 모양도 바뀔 수 있습니다.'}</p>`;
  inspector.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button=>button.onclick=()=>{($('prop-color') as HTMLInputElement).value=button.dataset.color!;inspector.querySelectorAll('.swatch').forEach(b=>b.classList.toggle('active',b===button));});
  $('delete-selection').onclick=()=>deleteSelection();
  $('properties').addEventListener('submit',event=>{
    event.preventDefault();
    try {
      const next=structuredClone(history.document),changed=next.objects.find(item=>item.id===o.id)!;
      changed.name=($('prop-name') as HTMLInputElement).value.trim()||o.name;
      changed.style={color:($('prop-color') as HTMLInputElement).value,width:parseNumber('prop-width'),labelVisible:($('prop-label') as HTMLInputElement).checked};
      changed.locked=($('prop-locked') as HTMLInputElement).checked;changed.hidden=($('prop-hidden') as HTMLInputElement).checked;
      if(isFreePoint(changed))changed.definition.position=[parseNumber('prop-x'),parseNumber('prop-y')];
      if(changed.type==='circle')changed.definition.radius=parseNumber('prop-radius');
      commit(next);status('변경을 적용했습니다. 연결된 객체도 함께 갱신되었습니다.');
    } catch(e){error((e as Error).message);}
  });
}
function parseNumber(id:string):number {
  const value=($<HTMLInputElement>(id)).value.trim();
  if(value===''||!Number.isFinite(Number(value)))throw Error('빈칸 대신 유효한 수를 입력하세요.');
  return Number(value);
}
function render() {
  $('title').setAttribute('title',history.document.title);
  if(document.activeElement!==$('title'))($('title') as HTMLInputElement).value=history.document.title;
  ($('undo') as HTMLButtonElement).disabled=!history.past.length;
  ($('redo') as HTMLButtonElement).disabled=!history.future.length;
  renderCanvas();renderList();renderInspector();
}
async function deleteSelection() {
  if(!selected.size)return;
  const remove=cascadeIds(history.document,[...selected]);
  const extra=[...remove].filter(id=>!selected.has(id));
  if(extra.length) {
    const labels=history.document.objects.filter(o=>extra.includes(o.id)).map(o=>o.name);
    if(!await confirmAction('연결된 객체도 삭제할까요?',`선택한 객체를 삭제하면 다음 객체도 삭제됩니다.\n${labels.join(', ')}\n실행 취소로 복원할 수 있습니다.`))return;
  }
  const next=structuredClone(history.document);next.objects=next.objects.filter(o=>!remove.has(o.id));
  selected.clear();construction=[];commit(next);status(`${remove.size}개 객체를 삭제했습니다. 실행 취소로 복원할 수 있습니다.`);
}
function cancelDrag() {
  if(drag) {history.document=drag.previous;drag=null;svg.classList.remove('dragging');render();}
}
svg.addEventListener('pointerdown',event=>{
  if(event.button!==0&&event.button!==1)return;
  if(drag)return;
  svg.focus();
  if(spaceHeld||tool==='pan'||event.button===1) {
    event.preventDefault();drag={previous:structuredClone(history.document),start:localPoint(event),ids:new Set(),pan:true,pointerId:event.pointerId};svg.setPointerCapture(event.pointerId);svg.classList.add('dragging');return;
  }
  if(tool!=='select') {try{constructionClick(event);}catch(e){error((e as Error).message);}return;}
  const element=(event.target as Element).closest('[data-object]'),id=element?.getAttribute('data-object')||null;
  if(event.shiftKey){selection(id,true);return;}
  if(!id){selection(null);return;}
  if(!selected.has(id))selection(id);
  const ids=movablePoints(history.document,[...selected]);
  if(!ids.size) {status('이 객체는 관계로 계산되거나 잠겨 있어 직접 이동할 수 없습니다.');return;}
  drag={previous:structuredClone(history.document),start:localPoint(event),ids,pan:false,pointerId:event.pointerId};
  svg.setPointerCapture(event.pointerId);svg.classList.add('dragging');
});
svg.addEventListener('pointermove',event=>{
  const p=localPoint(event),world=screenToWorld(p,history.document.viewport,...dimensions);
  $('pointer-coords').textContent=`x ${number(world[0],2)} · y ${number(world[1],2)}`;
  if(!drag||drag.pointerId!==event.pointerId)return;
  const unit=drag.previous.viewport.pixelsPerUnit;
  let dx=(p[0]-drag.start[0])/unit,dy=-(p[1]-drag.start[1])/unit;
  try {
    if(drag.pan) {
      history.document=structuredClone(drag.previous);
      history.document.viewport.center=[drag.previous.viewport.center[0]-dx,drag.previous.viewport.center[1]-dy];
    } else {
      if(history.document.snap) {
        const anchor=drag.previous.objects.find(o=>drag!.ids.has(o.id))! as Point & {definition:{position:Position}};
        dx=Math.round((anchor.definition.position[0]+dx)*2)/2-anchor.definition.position[0];
        dy=Math.round((anchor.definition.position[1]+dy)*2)/2-anchor.definition.position[1];
      }
      history.document=translate(drag.previous,drag.ids,dx,dy);
    }
    renderCanvas();renderInspector();
  } catch(e){status((e as Error).message);}
});
function finishDrag(event:PointerEvent) {
  if(!drag||drag.pointerId!==event.pointerId)return;
  const previous=drag.previous,next=history.document;drag=null;svg.classList.remove('dragging');
  try{commit(next,previous);status('이동했습니다. 좌표와 관계가 함께 갱신되었습니다.');}
  catch(e){history.document=previous;render();error((e as Error).message);}
}
svg.addEventListener('pointerup',finishDrag);
svg.addEventListener('pointercancel',()=>cancelDrag());
svg.addEventListener('lostpointercapture',()=>{if(drag)cancelDrag();});
function zoom(factor:number,anchor:Position=[dimensions[0]/2,dimensions[1]/2]) {
  if(drag)return;
  const next=structuredClone(history.document),before=screenToWorld(anchor,next.viewport,...dimensions);
  next.viewport.pixelsPerUnit=Math.max(10,Math.min(500,next.viewport.pixelsPerUnit*factor));
  const after=screenToWorld(anchor,next.viewport,...dimensions);
  next.viewport.center=[next.viewport.center[0]+before[0]-after[0],next.viewport.center[1]+before[1]-after[1]];
  try{history.document=validateDocument(next);renderCanvas();saveLocal();}catch(e){status((e as Error).message);}
}
svg.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(-Math.sign(event.deltaY)*.15),localPoint(event));},{passive:false});
$('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);
$('reset-view').onclick=()=>{history.document.viewport={center:[0,0],pixelsPerUnit:65};renderCanvas();saveLocal();};
for(const key of ['grid','snap'] as const) ($<HTMLInputElement>(key)).onchange=()=>{history.document[key]=($<HTMLInputElement>(key)).checked;renderCanvas();saveLocal();};
function undo() {cancelDrag();construction=[];if(history.undo()){selected.clear();render();saveLocal();status('이전 작업을 취소했습니다.');}}
function redo() {cancelDrag();construction=[];if(history.redo()){selected.clear();render();saveLocal();status('작업을 다시 적용했습니다.');}}
$('undo').onclick=undo;$('redo').onclick=redo;
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button=>button.onclick=()=>setTool(button.dataset.tool!));
$('title').addEventListener('change',()=>{const next=structuredClone(history.document);next.title=($('title') as HTMLInputElement).value.trim()||'새 수학 노트';try{commit(next);}catch(e){error((e as Error).message);render();}});
function download(content:string,type:string,extension:string) {
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');
  a.href=url;a.download=(history.document.title.replace(/[\\/:*?"<>|]/g,'_')||'EucliDraw')+extension;
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('save').onclick=()=>{download(JSON.stringify(history.document,null,2),'application/json','.euclidraw');status('장면 파일을 저장했습니다. 열기로 객체와 관계를 복원할 수 있습니다.');};
$('export').onclick=()=>{
  const clone=svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('.hit-target,.selection-halo,title').forEach(e=>e.remove());
  clone.querySelectorAll('[data-object]').forEach(e=>{e.removeAttribute('role');e.removeAttribute('aria-label');});
  clone.setAttribute('width',String(dimensions[0]));clone.setAttribute('height',String(dimensions[1]));
  // SVG must carry its styling so another viewer does not depend on this page.
  const style=svgElement('style');style.textContent='.point-label{font-family:Georgia,serif;font-style:italic}.grid-label{font-size:10px;fill:#a8a4bb}.object-label{font-family:sans-serif;font-size:12px;fill:#8b83a2}';clone.prepend(style);
  const bg=svgElement('rect',{width:'100%',height:'100%',fill:'#fafaff'});clone.insertBefore(bg,style.nextSibling);
  download(new XMLSerializer().serializeToString(clone),'image/svg+xml','.svg');status('현재 화면의 도형을 SVG로 저장했습니다.');
};
$('open').onclick=()=>($('file-input') as HTMLInputElement).click();
$('file-input').addEventListener('change',async()=>{
  const input=$('file-input') as HTMLInputElement,file=input.files?.[0];if(!file)return;
  try {
    if(file.size>2e6)throw Error('파일 크기는 2MB 이하여야 합니다.');
    const candidate=validateDocument(JSON.parse(await file.text()));
    if(!await confirmAction('장면을 열까요?','현재 장면을 새 파일로 바꿉니다. 현재 작업을 보관하려면 먼저 파일 저장을 이용하세요.'))return;
    cancelDrag();history.load(candidate);selected.clear();construction=[];storageWritable=true;setTool('select');render();saveLocal(true);status('장면을 열었습니다. 객체와 관계를 복원했습니다.');
  } catch(e){error((e as Error).message);}finally{input.value='';}
});
async function replaceDocument(next:MathDocument) {
  if(!await confirmAction('노트를 바꿀까요?','현재 작업을 바꿉니다. 실행 취소로 돌아갈 수 있습니다.'))return;
  cancelDrag();selected.clear();construction=[];storageWritable=true;commit(next);setTool('select');
}
$('new').onclick=()=>replaceDocument(emptyDocument());$('example').onclick=()=>replaceDocument(demoDocument());
function isTyping(target:EventTarget|null):boolean {return target instanceof HTMLElement&&(target.matches('input,textarea,select')||target.isContentEditable);}
document.addEventListener('keydown',event=>{
  if(isTyping(event.target)||document.querySelector('dialog[open]'))return;
  const mod=event.ctrlKey||event.metaKey;
  if(mod&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return;}
  if(mod&&event.key.toLowerCase()==='y'){event.preventDefault();redo();return;}
  if(mod&&event.key.toLowerCase()==='s'){event.preventDefault();$('save').click();return;}
  if(event.code==='Space'){event.preventDefault();spaceHeld=true;svg.dataset.tool='pan';return;}
  if(event.key==='Escape'){cancelDrag();construction=[];selection(null);setTool('select');return;}
  if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelection();return;}
  const moves:Record<string,Position>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};
  if(event.key in moves&&selected.size){event.preventDefault();const factor=event.shiftKey?1:.1;const [x,y]=moves[event.key];try{commit(translate(history.document,movablePoints(history.document,[...selected]),x*factor,y*factor));}catch(e){error((e as Error).message);}return;}
  const keys:Record<string,string>={v:'select',h:'pan',p:'point',s:'segment',l:'line',w:'vector',c:'circle',t:'polygon',m:'midpoint'};
  if(!mod&&keys[event.key.toLowerCase()])setTool(keys[event.key.toLowerCase()]);
});
document.addEventListener('keyup',event=>{if(event.code==='Space'){spaceHeld=false;svg.dataset.tool=tool;}});
window.addEventListener('blur',()=>{spaceHeld=false;cancelDrag();svg.dataset.tool=tool;});
window.addEventListener('pagehide',()=>{if(drag)cancelDrag();if(saveTimer)saveLocal(true);});
new ResizeObserver(()=>{const rect=svg.getBoundingClientRect();dimensions=[Math.max(1,rect.width),Math.max(1,rect.height)];renderCanvas();}).observe(svg);
setTool('select');render();
if(recoveryMessage){$('save-state').textContent='자동 저장 자료 확인 필요';status(recoveryMessage);}else saveLocal();
