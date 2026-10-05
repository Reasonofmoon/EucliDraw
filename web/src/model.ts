/** Mathematical document. All positions are world units; never screen pixels. */
export type Position = [number, number];
export type Style = { color: string; width: number; labelVisible: boolean };
export type Base = { id: string; name: string; hidden: boolean; locked: boolean; style: Style };
export type Point = Base & { type: 'point'; definition: { position: Position } | { rule: 'midpoint'; inputs: [string, string] } };
export type Line = Base & { type: 'segment' | 'line' | 'vector'; definition: { points: [string, string] } };
export type Polygon = Base & { type: 'polygon'; definition: { points: string[] } };
export type Circle = Base & { type: 'circle'; definition: { center: string; radius: number } };
export type MathObject = Point | Line | Polygon | Circle;
export type Viewport = { center: Position; pixelsPerUnit: number };
export type Document = { schemaVersion: 1; title: string; objects: MathObject[]; viewport: Viewport; grid: boolean; snap: boolean };
export type Evaluation = { valid: boolean; points: Position[]; reason?: string; length?: number; area?: number; radius?: number };
const MAX_COORDINATE = 1e6;
export const COLORS = ['#6554c0', '#257fa4', '#d16c3f', '#39937b', '#c1537e', '#26364c'];
export function finite(value: unknown, name: string, maximum = MAX_COORDINATE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > maximum) throw Error(`${name}: 유효한 수를 입력하세요.`);
  return value;
}
function position(value: unknown): Position {
  if (!Array.isArray(value) || value.length !== 2) throw Error('좌표에는 X와 Y가 필요합니다.');
  return [finite(value[0], 'X'), finite(value[1], 'Y')];
}
export function base(type: MathObject['type'], name: string, color = COLORS[0]): Base {
  return { id: crypto.randomUUID(), name, hidden: false, locked: false, style: { color, width: 2.5, labelVisible: true } };
}
export function createPoint(name: string, p: Position, color = COLORS[0]): Point {
  return { ...base('point', name, color), type: 'point', definition: { position: position(p) } };
}
export function refs(object: MathObject): string[] {
  const d = object.definition;
  if ('inputs' in d) return [...d.inputs];
  if ('points' in d) return [...d.points];
  if ('center' in d) return [d.center];
  return [];
}
export function isFreePoint(object: MathObject): object is Point & { definition: { position: Position } } {
  return object.type === 'point' && 'position' in object.definition;
}
export function validateDocument(input: unknown): Document {
  if (!input || typeof input !== 'object') throw Error('올바른 EucliDraw 파일이 아닙니다.');
  const d = input as Document;
  if (d.schemaVersion !== 1) throw Error('지원하지 않는 문서 버전입니다.');
  if (typeof d.title !== 'string' || d.title.length > 120) throw Error('문서 이름은 120자 이내여야 합니다.');
  if (!Array.isArray(d.objects) || d.objects.length > 2000) throw Error('객체는 최대 2000개까지 열 수 있습니다.');
  if (!d.viewport || finite(d.viewport.pixelsPerUnit, '배율', 500) < 10) throw Error('배율은 10~500 사이여야 합니다.');
  position(d.viewport.center);
  if (typeof d.grid !== 'boolean' || typeof d.snap !== 'boolean') throw Error('격자 설정이 올바르지 않습니다.');
  const ids = new Map<string, MathObject>();
  for (const o of d.objects) {
    if (!o || typeof o.id !== 'string' || !o.id || o.id.length > 120 || ids.has(o.id)) throw Error('객체 ID가 없거나 중복됩니다.');
    if (typeof o.name !== 'string' || o.name.length > 100) throw Error('객체 이름은 100자 이내여야 합니다.');
    if (typeof o.hidden !== 'boolean' || typeof o.locked !== 'boolean') throw Error('객체 표시 설정이 올바르지 않습니다.');
    if (!o.style || !/^#[0-9a-f]{6}$/i.test(o.style.color) || finite(o.style.width, '선 두께', 12) <= 0 || typeof o.style.labelVisible !== 'boolean') throw Error('색상이나 선 설정이 올바르지 않습니다.');
    if (!o.definition || typeof o.definition !== 'object') throw Error('객체 정의가 없습니다.');
    if (o.type === 'point') {
      if ('position' in o.definition) position(o.definition.position);
      else if (!('rule' in o.definition) || o.definition.rule !== 'midpoint' || !Array.isArray(o.definition.inputs) || o.definition.inputs.length !== 2) throw Error('중점 정의가 올바르지 않습니다.');
    } else if (['line', 'segment', 'vector', 'polygon'].includes(o.type)) {
      const points = (o as Line | Polygon).definition.points;
      if (!Array.isArray(points) || points.length > 200 || points.length < (o.type === 'polygon' ? 3 : 2) || (o.type !== 'polygon' && points.length !== 2)) throw Error('도형의 꼭짓점 개수가 올바르지 않습니다.');
      if (new Set(points).size !== points.length) throw Error('같은 점을 중복 사용할 수 없습니다.');
    } else if (o.type === 'circle') {
      if (finite(o.definition.radius, '반지름', 10000) <= 0) throw Error('반지름은 0보다 커야 합니다.');
    } else throw Error('지원하지 않는 객체입니다.');
    ids.set(o.id, o);
  }
  // Check references and cycles before any evaluation, independent of file ordering.
  const done = new Set<string>();
  const active = new Set<string>();
  function visit(id: string, depth = 0) {
    if (active.has(id)) throw Error('순환 참조가 있습니다.');
    if (done.has(id)) return;
    if (depth > 100) throw Error('객체 관계가 너무 깊습니다.');
    const o = ids.get(id);
    if (!o || o.type !== 'point') throw Error('참조하는 점이 없습니다.');
    active.add(id);
    for (const reference of refs(o)) visit(reference, depth + 1);
    active.delete(id); done.add(id);
  }
  for (const o of d.objects) {
    for (const reference of refs(o)) if (typeof reference !== 'string' || !ids.has(reference) || ids.get(reference)!.type !== 'point') throw Error('참조하는 점이 없습니다.');
    if (o.type === 'point') visit(o.id);
  }
  // Canonicalize input; do not persist unrecognized fields from imported files.
  const objects = d.objects.map(o => {
    const common = { id: o.id, name: o.name, hidden: o.hidden, locked: o.locked,
      style: { color: o.style.color, width: o.style.width, labelVisible: o.style.labelVisible } };
    if (o.type === 'point') return { ...common, type: o.type, definition: 'position' in o.definition ? { position: position(o.definition.position) } : { rule: 'midpoint', inputs: [...o.definition.inputs] } };
    if (o.type === 'circle') return { ...common, type: o.type, definition: { center: o.definition.center, radius: o.definition.radius } };
    return { ...common, type: o.type, definition: { points: [...o.definition.points] } };
  }) as MathObject[];
  return { schemaVersion: 1, title: d.title, objects, viewport: { center: position(d.viewport.center), pixelsPerUnit: d.viewport.pixelsPerUnit }, grid: d.grid, snap: d.snap };
}
export function evaluate(document: Document): Map<string, Evaluation> {
  const result = new Map<string, Evaluation>();
  const objects = new Map(document.objects.map(o => [o.id, o]));
  function point(id: string): Position | undefined {
    if (result.has(id)) return result.get(id)!.valid ? result.get(id)!.points[0] : undefined;
    const o = objects.get(id);
    if (!o || o.type !== 'point') return undefined;
    let p: Position | undefined;
    if (isFreePoint(o)) p = o.definition.position;
    else {
      const d = o.definition as { inputs: [string,string] };
      const a = point(d.inputs[0]), b = point(d.inputs[1]);
      if (a && b) p = [(a[0]+b[0])/2, (a[1]+b[1])/2];
    }
    result.set(id, p ? { valid: true, points: [p] } : { valid: false, points: [], reason: '참조하는 점을 계산할 수 없습니다.' });
    return p;
  }
  for (const o of document.objects) {
    if (o.type === 'point') { point(o.id); continue; }
    const values = refs(o).map(point);
    if (values.some(p => !p)) { result.set(o.id, { valid: false, points: [], reason: '참조하는 점을 계산할 수 없습니다.' }); continue; }
    const points = values as Position[];
    let value: Evaluation = { valid: true, points };
    if (o.type === 'circle') {
      value.radius = o.definition.radius; value.area = Math.PI * value.radius ** 2;
    } else if (o.type === 'polygon') {
      value.area = Math.abs(points.reduce((sum,p,i) => { const q = points[(i+1)%points.length]; return sum+p[0]*q[1]-q[0]*p[1]; },0))/2;
      // Area is intended for simple polygons only. Detect crossing edges.
      if (selfIntersects(points)) value = { valid: false, points, reason: '변이 교차하는 다각형은 넓이를 표시하지 않습니다.' };
    } else {
      value.length = Math.hypot(points[1][0]-points[0][0], points[1][1]-points[0][1]);
      if (o.type === 'line' && value.length < 1e-12) value = { valid: false, points, reason: '같은 위치의 두 점으로 직선을 정의할 수 없습니다.' };
    }
    result.set(o.id, value);
  }
  return result;
}
function selfIntersects(p: Position[]): boolean {
  const cross = (a: Position,b: Position,c: Position) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for (let i=0;i<p.length;i++) for(let j=i+1;j<p.length;j++) {
    if (j === i+1 || (i === 0 && j === p.length-1)) continue;
    const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];
    if(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return true;
  }
  return false;
}
export function cascadeIds(document: Document, ids: string[]): Set<string> {
  const found = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const o of document.objects) if (!found.has(o.id) && refs(o).some(r => found.has(r))) { found.add(o.id); changed = true; }
  }
  return found;
}
export function movablePoints(document: Document, ids: string[]): Set<string> {
  const map = new Map(document.objects.map(o => [o.id,o]));
  const result = new Set<string>();
  for (const id of ids) {
    const o = map.get(id);
    if (!o || o.locked) continue;
    if (isFreePoint(o)) result.add(id);
    else if (o.type !== 'point') for (const r of refs(o)) {
      const point = map.get(r);
      if (point && isFreePoint(point) && !point.locked) result.add(r);
    }
  }
  return result;
}
export function translate(document: Document, ids: Set<string>, dx: number, dy: number): Document {
  const clone = structuredClone(document);
  for (const o of clone.objects) if (ids.has(o.id) && isFreePoint(o)) o.definition.position = position([o.definition.position[0]+dx,o.definition.position[1]+dy]);
  return clone;
}
export function worldToScreen(p: Position, viewport: Viewport, width: number, height: number): Position {
  return [width/2+(p[0]-viewport.center[0])*viewport.pixelsPerUnit,height/2-(p[1]-viewport.center[1])*viewport.pixelsPerUnit];
}
export function screenToWorld(p: Position, viewport: Viewport, width: number, height: number): Position {
  return [viewport.center[0]+(p[0]-width/2)/viewport.pixelsPerUnit,viewport.center[1]-(p[1]-height/2)/viewport.pixelsPerUnit];
}
export function emptyDocument(): Document {
  return { schemaVersion: 1, title: '새 수학 노트', objects: [], viewport: { center: [0,0], pixelsPerUnit: 65 }, grid: true, snap: true };
}
export function demoDocument(): Document {
  const d=emptyDocument(); d.title='삼각형과 중점'; d.viewport.center=[1.5,1.3];
  const a=createPoint('A',[-2,0]),b=createPoint('B',[3,0]),c=createPoint('C',[1,3],COLORS[1]);
  const triangle: Polygon={...base('polygon','삼각형 ABC'),type:'polygon',definition:{points:[a.id,b.id,c.id]}};
  const midpoint: Point={...base('point','M',COLORS[2]),type:'point',definition:{rule:'midpoint',inputs:[a.id,b.id]}};
  const median: Line={...base('segment','중선 CM',COLORS[2]),type:'segment',definition:{points:[c.id,midpoint.id]}};
  d.objects=[triangle,median,a,b,c,midpoint];return d;
}
export class History {
  document: Document;
  past: Document[]=[];
  future: Document[]=[];
  constructor(document: Document) { this.document=validateDocument(document); }
  commit(next: Document, previous = this.document): boolean {
    const valid=validateDocument(next);
    if(JSON.stringify(valid)===JSON.stringify(previous)) {this.document=valid;return false;}
    this.past.push(structuredClone(previous));if(this.past.length>100)this.past.shift();
    this.future=[];this.document=valid;return true;
  }
  undo(): boolean { const old=this.past.pop();if(!old)return false;this.future.push(structuredClone(this.document));this.document=old;return true; }
  redo(): boolean { const next=this.future.pop();if(!next)return false;this.past.push(structuredClone(this.document));this.document=next;return true; }
  load(input: unknown) {const next=validateDocument(input);this.document=next;this.past=[];this.future=[];}
}
