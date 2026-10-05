import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History, demoDocument, emptyDocument, createPoint, base, evaluate, isFreePoint, movablePoints, translate, cascadeIds, validateDocument, screenToWorld, worldToScreen } from '../src/model.ts';
import type { Document, Point, Line, Polygon } from '../src/model.ts';
const near = (a: number,b: number) => assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
function fixture() {
  const doc=demoDocument();return {doc,a:doc.objects.find(o=>o.name==='A')!,b:doc.objects.find(o=>o.name==='B')!,c:doc.objects.find(o=>o.name==='C')!,m:doc.objects.find(o=>o.name==='M')!,polygon:doc.objects.find(o=>o.type==='polygon')!};
}
test('moving A updates its midpoint and triangle area; B remains fixed',()=>{
  const {doc,a,b,m,polygon}=fixture();
  const next=translate(doc,movablePoints(doc,[a.id]),2,2),values=evaluate(next);
  assert.deepEqual(values.get(a.id)!.points[0],[0,2]);
  assert.deepEqual(values.get(b.id)!.points[0],[3,0]);
  assert.deepEqual(values.get(m.id)!.points[0],[1.5,1]);
  near(values.get(polygon.id)!.area!,2.5);
  assert.deepEqual(evaluate(doc).get(a.id)!.points[0],[-2,0]);
});
test('objects share points: group movement translates a shared point only once',()=>{
  const {doc,a,b,polygon}=fixture();
  const segment:Line={...base('segment','AB'),type:'segment',definition:{points:[a.id,b.id]}};
  doc.objects.push(segment);
  const ids=movablePoints(doc,[polygon.id,segment.id]);assert.equal(ids.size,3);
  const next=translate(doc,ids,1,-2),values=evaluate(next);
  assert.deepEqual(values.get(a.id)!.points[0],[-1,-2]);assert.deepEqual(values.get(b.id)!.points[0],[4,-2]);
});
test('derived and locked points cannot be moved directly',()=>{
  const {doc,a,m}=fixture();a.locked=true;
  assert.equal(movablePoints(doc,[a.id,m.id]).size,0);
});
test('nested midpoints evaluate regardless of object order',()=>{
  const {doc,a,m}=fixture();
  const n:Point={...base('point','N'),type:'point',definition:{rule:'midpoint',inputs:[a.id,m.id]}};
  doc.objects.unshift(n);
  const values=evaluate(validateDocument(doc));assert.deepEqual(values.get(n.id)!.points[0],[-.75,0]);
});
test('save/load preserves dependencies and allows subsequent movement',()=>{
  const {doc,a,m}=fixture();
  const loaded=validateDocument(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(loaded,doc);
  const moved=translate(loaded,new Set([a.id]),4,0);
  assert.deepEqual(evaluate(moved).get(m.id)!.points[0],[2.5,0]);
});
test('coordinate conversion is inverse at different zoom levels',()=>{
  for(const zoom of [10,65,500])for(const p of [[0,0],[-2,3],[250,-140]] as [number,number][]) {
    const view={center:[13,-8] as [number,number],pixelsPerUnit:zoom};
    const result=screenToWorld(worldToScreen(p,view,1234,777),view,1234,777);
    near(result[0],p[0]);near(result[1],p[1]);
  }
});
test('invalid documents reject cycles, missing references and duplicate IDs',()=>{
  const {doc,a,m}=fixture();
  const cycle=structuredClone(doc);const p=cycle.objects.find(o=>o.id===a.id)! as Point;
  p.definition={rule:'midpoint',inputs:[m.id,a.id]};assert.throws(()=>validateDocument(cycle),/순환/);
  const missing=structuredClone(doc);missing.objects=missing.objects.filter(o=>o.id!==a.id);assert.throws(()=>validateDocument(missing),/참조/);
  const duplicate=structuredClone(doc);duplicate.objects.push(duplicate.objects[0]);assert.throws(()=>validateDocument(duplicate),/중복/);
});
test('nonfinite numbers and unknown schema are rejected',()=>{
  for(const n of [NaN,Infinity,-Infinity,1000001]) {
    const doc=emptyDocument();doc.objects=[{...createPoint('A',[0,0]),definition:{position:[n,0]}}];
    assert.throws(()=>validateDocument(doc));
  }
  assert.throws(()=>validateDocument({...emptyDocument(),schemaVersion:2}),/버전/);
  assert.throws(()=>validateDocument({...emptyDocument(),viewport:{center:[0,0],pixelsPerUnit:0}}),/배율/);
});
test('circle validation rejects zero or negative radius',()=>{
  const doc=emptyDocument(),a=createPoint('A',[0,0]);
  for(const radius of [0,-1,Infinity]) {
    doc.objects=[a,{...base('circle','원'),type:'circle',definition:{center:a.id,radius}}];
    assert.throws(()=>validateDocument(doc));
  }
});
test('failed load and commit preserve document and history',()=>{
  const h=new History(demoDocument()),prior=structuredClone(h.document);
  assert.throws(()=>h.load({...prior,schemaVersion:500}));assert.deepEqual(h.document,prior);
  const next=structuredClone(prior);next.objects[0].name='x'.repeat(101);
  assert.throws(()=>h.commit(next));assert.equal(h.past.length,0);assert.deepEqual(h.document,prior);
});
test('a preview drag commits as one undo action',()=>{
  const {doc,a}=fixture(),h=new History(doc),previous=structuredClone(h.document);
  for(let i=1;i<=30;i++)h.document=translate(previous,new Set([a.id]),i*.1,0);
  h.commit(h.document,previous);assert.equal(h.past.length,1);
  h.undo();assert.deepEqual(h.document,previous);
  h.redo();near(evaluate(h.document).get(a.id)!.points[0][0],1);
});
test('100 edits undo and redo without losing object relationships',()=>{
  const {doc,a,m}=fixture(),h=new History(doc);
  for(let i=0;i<100;i++)h.commit(translate(h.document,new Set([a.id]),.1,0));
  for(let i=0;i<100;i++)assert.equal(h.undo(),true);
  assert.deepEqual(h.document,doc);
  for(let i=0;i<100;i++)assert.equal(h.redo(),true);
  near(evaluate(h.document).get(m.id)!.points[0][0],5.5);
});
test('dependent deletion propagates, retaining unrelated points',()=>{
  const {doc,a,b,c,m,polygon}=fixture();const remove=cascadeIds(doc,[a.id]);
  assert.ok(remove.has(m.id));assert.ok(remove.has(polygon.id));assert.ok(!remove.has(b.id));assert.ok(!remove.has(c.id));
  const next={...doc,objects:doc.objects.filter(o=>!remove.has(o.id))};validateDocument(next);
});
test('coincident endpoints make a line undefined but keep a zero vector defined',()=>{
  const doc=emptyDocument(),a=createPoint('A',[0,0]),b=createPoint('B',[0,0]);
  const line:Line={...base('line','l'),type:'line',definition:{points:[a.id,b.id]}};
  const vector:Line={...base('vector','v'),type:'vector',definition:{points:[a.id,b.id]}};
  doc.objects=[a,b,line,vector];const values=evaluate(validateDocument(doc));
  assert.equal(values.get(line.id)!.valid,false);assert.equal(values.get(vector.id)!.length,0);
});
test('self-intersecting polygons are marked undefined rather than displaying a false area',()=>{
  const doc=emptyDocument(),p=[[0,0],[2,2],[0,2],[2,0]].map((v,i)=>createPoint(String(i),v as [number,number]));
  const polygon:Polygon={...base('polygon','교차 도형'),type:'polygon',definition:{points:p.map(o=>o.id)}};
  doc.objects=[...p,polygon];const value=evaluate(validateDocument(doc)).get(polygon.id)!;
  assert.equal(value.valid,false);assert.equal(value.area,undefined);
});
test('import canonicalization drops unrelated fields and copies reference arrays',()=>{
  const doc=demoDocument(),input={...doc,arbitrary:{script:'untrusted'}};
  const clean=validateDocument(input);
  assert.equal('arbitrary' in clean,false);clean.objects[0].name='new';assert.notEqual(clean.objects[0].name,input.objects[0].name);
});
