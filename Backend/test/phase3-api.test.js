import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {startApi} from './helpers.js';
import {SEED_PRODUCTS} from '../scripts/seed-data.js';
import {compatible,objective,greedyReference,cents} from './oracles/phase3-reference.js';
let api;
before(async()=>{api=await startApi();});
after(async()=>{await api.close();});

test('HTTP search respects out-of-stock locks and validates lock categories',async()=>{
  const response=await api.post('/builds/search',{locked:{cpu:'cpu-r7-7800x3d'},inStockOnly:true},'staff');
  assert.equal(response.status,200);assert.equal(response.body.data.solutions.length,0);assert.equal(response.body.data.stopped,null);
  for(const locked of [{cpu:'missing'},{cpu:'ram-fury-16-d4'}])assert.equal((await api.post('/builds/search',{locked},'staff')).status,422);
});

test('HTTP optimizer reconstruction agrees with independent scoring and budget/compatibility rules',async()=>{
  const response=await api.post('/optimizer/recommendations',{budget:70000,useCase:'Programming',lean:true},'staff');
  assert.equal(response.status,200);
  const {rec,input}=response.body.data;
  assert.equal(rec.ok,true);assert.ok(compatible(Object.fromEntries(rec.items.map(i=>[i.cat,i.product]))));
  const ref=objective(Object.fromEntries(rec.items.map(i=>[i.cat,i.product])),input);
  assert.ok(Math.abs(rec.score-ref.score)<1e-9);assert.equal(rec.items.reduce((s,i)=>s+cents(i.price),0),cents(rec.total));
  assert.ok(rec.total<=input.budget);assert.equal(response.body.data.compatibility.overall,'compatible');
  assert.ok(rec.table.rows.flatMap(r=>r.cells).every(c=>c.v===null||Number.isFinite(c.v)));
  assert.equal((await api.post('/optimizer/runs',{budget:70000},'staff')).status,403);
});

test('HTTP restock results match the independent formula, ordering and allocation',async()=>{
  const budget=250000,cover=14,response=await api.post('/restock/recommendations',{budget,coverDays:cover},'staff');
  assert.equal(response.status,200);
  const plan=response.body.data,ref=greedyReference(SEED_PRODUCTS,budget,cover);
  const fields=x=>({id:x.id,urgency:x.urgency,qty:x.qty,orderQty:x.orderQty,decision:x.decision});
  assert.deepEqual(plan.cands.map(fields),ref.map(fields));
  assert.equal(plan.remaining,ref.at(-1).remaining);assert.equal(cents(plan.remaining)+cents(plan.totalCost),cents(budget));
  assert.equal(plan.rows,undefined);assert.ok(plan.cands.every(r=>r.p===undefined));
});

test('HTTP invalid inputs return field errors and zero restock budget safely skips orders',async()=>{
  for(const body of [{budget:0},{budget:-1},{budget:500001},{budget:20000,pri:{graphics:0}},{budget:20000,minRam:16}]) {
    const response=await api.post('/optimizer/recommendations',body,'staff');assert.equal(response.status,422);assert.ok(response.body.error.details);
  }
  for(const body of [{budget:-1},{budget:100,coverDays:1}])assert.equal((await api.post('/restock/recommendations',body,'staff')).status,422);
  const zero=await api.post('/restock/recommendations',{budget:0},'staff');assert.equal(zero.status,200);assert.equal(zero.body.data.selected.length,0);
});
