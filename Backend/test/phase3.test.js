import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backtrackSearch,optimizeBuild,restockPlan,checkBuild,indexProducts} from '../../shared/uw-core.js';
import {singleBuild,backtrackingFixture,dpFixture,restockItem,greedyFixture} from './fixtures/phase3-catalog.js';
import {cats,enumerate,compatible,bruteBest,objective,greedyReference,fullOrderOracle,cents} from './oracles/phase3-reference.js';
import {optimizerService} from '../src/services/algorithmServices.js';
const key=sel=>cats.map(c=>sel[c]).join('|');
const sets=rows=>rows.map(r=>key(r.sel)).sort();
const search=products=>backtrackSearch({products,maxSolutions:10000,maxNodes:100000,traceLimit:0});

test('independent backtracking oracle: complete bounded solution sets and budget boundaries',()=>{
  for(const budget of [0,799,800,819,820,1000]) {
    const products=backtrackingFixture();
    const actual=backtrackSearch({products,budget,maxSolutions:1000,maxNodes:100000});
    assert.equal(actual.stopped,null);
    assert.deepEqual(sets(actual.solutions),sets(enumerate(products,{budget})));
  }
  assert.equal(search(singleBuild()).solutions.length,1);
  assert.equal(search([]).solutions.length,0);
  for(const cat of cats.filter(c=>c!=='gpu'))assert.equal(search(singleBuild().filter(p=>p.category!==cat)).solutions.length,0,cat);
});

test('all eleven compatibility rules independently reject contradictions and unknowns',()=>{
  const mutations=[['cpu','socket','AM5'],['ram','type','DDR5'],['case','forms','ATX'],
    ['gpu','length',1000],['cooler','sockets','AM5'],['cooler','height',1000],
    ['cooler','rating',10],['psu','watt',50],['psu','pcie8',0],['motherboard','m2',0],['motherboard','m2',.5]];
  for(const [cat,field,value] of mutations) {
    const products=singleBuild();products.find(p=>p.category===cat).specs[field]=value;
    const b=Object.fromEntries(products.map(p=>[p.category,p]));
    assert.equal(compatible(b),false,field);assert.equal(search(products).solutions.length,0,field);
  }
  const products=singleBuild().filter(p=>p.category!=='gpu');
  assert.equal(search(products).solutions.length,0,'display requires a GPU for non-iGPU CPU');
  products.find(p=>p.category==='cpu').specs.igpu='Yes';
  assert.equal(search(products).solutions.length,1);
  for(const [cat,field] of [['gpu','length'],['cooler','type'],['storage','iface'],['psu','pcie8'],['gpu','hpwr']]) {
    const unknown=singleBuild();delete unknown.find(p=>p.category===cat).specs[field];
    assert.equal(search(unknown).solutions.length,0,cat+'.'+field);
  }
});

test('Air/AIO, native/adapter connectors, SATA and virtual GPU variants match independent compatibility',()=>{
  for(const aio of [false,true])for(const hpwr of [false,true])for(const native of [false,true])for(const sata of [false,true]) {
    const products=singleBuild(),by=Object.fromEntries(products.map(p=>[p.category,p]));
    if(aio)Object.assign(by.cooler.specs,{type:'AIO',radiator:240});
    if(hpwr)by.gpu.specs.hpwr='Yes';if(native)by.psu.specs.hpwr='Yes';if(sata)by.storage.specs.iface='SATA';
    const sel=Object.fromEntries(cats.map(c=>[c,by[c].id]));
    assert.equal(checkBuild(sel,indexProducts(products)).overall==='compatible',compatible(by));
    assert.deepEqual(sets(search(products).solutions),sets(enumerate(products)));
  }
});

test('locks cannot bypass stock filtering, and invalid or wrong-category locks are rejected',()=>{
  const products=singleBuild();products[0].stock=0;
  assert.equal(backtrackSearch({products,inStockOnly:true,locked:{cpu:products[0].id}}).solutions.length,0);
  for(const locked of [{cpu:'missing'},{cpu:'ram-one'},{other:'cpu-one'}])assert.throws(()=>backtrackSearch({products,locked}),RangeError);
});

test('search caps are explicit and deterministic under reordered tied inputs',()=>{
  const products=backtrackingFixture();products.find(p=>p.id==='ram-two').price=100;
  const a=backtrackSearch({products,maxSolutions:1}),b=backtrackSearch({products:[...products].reverse(),maxSolutions:1});
  assert.equal(a.stopped,'solutions');assert.deepEqual(a.solutions,b.solutions);
  const limited=backtrackSearch({products,maxNodes:2});assert.equal(limited.stopped,'nodes');assert.equal(limited.stats.explored,2);
});

test('monetary cents: exact-budget search, reconstruction and restock allocations',()=>{
  const products=singleBuild().map((p,i)=>({...p,price:(i+1)/10}));
  assert.deepEqual(sets(backtrackSearch({products,budget:3.6}).solutions),sets(enumerate(products,{budget:3.6})));
  const dp=optimizeBuild({products,budget:3.6,unit:.01});assert.equal(dp.ok,true);assert.equal(dp.total,3.6);
  const rows=[restockItem('cent-a',{cost:.1,minStock:0,leadTime:1,dailySales:1}),restockItem('cent-b',{cost:.2,minStock:0,leadTime:1,dailySales:1})];
  const plan=restockPlan(rows,2.4,7);assert.equal(cents(plan.totalCost)+cents(plan.remaining),240);
  assert.equal(plan.selected.reduce((s,r)=>s+cents(r.orderCost),0),cents(plan.totalCost));
});

test('DP matches an independent exhaustive objective over all four use cases, lean modes and priorities',()=>{
  const products=dpFixture();
  for(const useCase of ['Gaming','Programming','Office Work','Content Creation'])for(const lean of [false,true])for(const budget of [799,800,900,1000,1100]) {
    const opts={budget,useCase,lean,pri:{graphics:5,processing:2,memory:4}};
    const ref=bruteBest(products,opts),actual=optimizeBuild({products,...opts});
    assert.equal(actual.ok,!!ref,JSON.stringify(opts));
    if(ref){assert.ok(Math.abs(actual.score-ref.score)<1e-9);assert.equal(actual.total,ref.total);
      assert.equal(actual.total,actual.items.reduce((s,p)=>s+cents(p.price),0)/100);
      assert.ok(compatible(Object.fromEntries(actual.items.map(p=>[p.cat,p.product]))));}
  }
});

test('DP grouped rounding, conservative infeasibility, decimal boundaries and cheap equal-score choices',()=>{
  const products=singleBuild();
  products.find(p=>p.category==='ram').price=101;
  assert.equal(optimizeBuild({products,budget:801}).ok,false);
  assert.equal(optimizeBuild({products,budget:801}).minFeasible,801);
  products.unshift({...structuredClone(products.find(p=>p.category==='ram')),id:'ram-expensive',price:199});
  const actual=optimizeBuild({products,budget:1000});
  assert.equal(actual.sel.ram,'ram-one');assert.equal(actual.total,801);
  assert.deepEqual(actual.sel,optimizeBuild({products:[...products].reverse(),budget:1000}).sel);
  products.push({...structuredClone(products.find(p=>p.category==='motherboard')),id:'mb-alt',price:200});
  const ranked=optimizeBuild({products,budget:1200});
  assert.deepEqual(ranked.topAnchors[0].sel,ranked.sel,'platform ranking uses the same lower-total tie break as the recommendation');
});

test('DP reports objective consistent with reconstructed path and independent rounded reference',()=>{
  const products=dpFixture().map((p,i)=>({...p,price:p.price+(i%3)*.01}));
  for(const lean of [false,true]) {
    const opts={budget:1300,useCase:'Gaming',lean},r=optimizeBuild({products,...opts}),ref=bruteBest(products,opts);
    const measured=objective(Object.fromEntries(r.items.map(i=>[i.cat,i.product])),opts);
    assert.ok(Math.abs(r.score-measured.score)<1e-9);assert.ok(Math.abs(measured.objective-ref.objective)<1e-9);
  }
});

test('reproducible varied platforms, stock/brand/RAM filters and shuffled catalogs match independent oracles',()=>{
  for(let seed=0;seed<16;seed++) {
    const products=dpFixture(),cpu=structuredClone(products.find(p=>p.category==='cpu')),
      mb=structuredClone(products.find(p=>p.category==='motherboard')),ram=structuredClone(products.find(p=>p.category==='ram'));
    Object.assign(cpu,{id:'cpu-alt',brand:'Intel',price:200,specs:{socket:'AM5',maxPower:90,igpu:'Yes'},perf:{gaming:80,work:90}});
    Object.assign(mb,{id:'mb-alt',price:200,specs:{...mb.specs,socket:'AM5',memType:'DDR5'}});
    Object.assign(ram,{id:'ram-alt',price:150,specs:{...ram.specs,type:'DDR5',capacity:32}});
    products.find(p=>p.category==='cooler').specs.sockets='AM4, AM5';products.push(cpu,mb,ram);
    for(let i=0;i<products.length;i++) {products[i].price+=((seed*17+i*13)%11)/100;if((seed+i)%9===0)products[i].stock=0;}
    const options={budget:1000+(seed%4)*200,cpuBrand:seed%3===0?'Intel':'Any',gpuBrand:seed%2?'NVIDIA':'Any',minRam:seed%4===0?32:0,
      excludeOOS:seed%3!==1,useCase:seed%2?'Gaming':'Programming',lean:seed%2===0};
    const actual=optimizeBuild({products,...options}),expected=bruteBest(products,options);
    assert.equal(actual.ok,!!expected,'DP fixture '+seed);
    if(expected){assert.ok(Math.abs(actual.score-expected.score)<1e-9);assert.equal(actual.total,expected.total);}
    const found=backtrackSearch({products,budget:options.budget,inStockOnly:options.excludeOOS,maxSolutions:10000,maxNodes:100000,traceLimit:0});
    assert.equal(found.stopped,null);assert.deepEqual(sets(found.solutions),sets(enumerate(products,{budget:options.budget,inStockOnly:options.excludeOOS})));
    assert.deepEqual(actual.sel,optimizeBuild({products:[...products].reverse(),...options}).sel);
  }
});

test('core validation rejects unsafe budgets, prices, priorities, limits and catalog identities before allocation',()=>{
  for(const budget of [-1,NaN,Infinity,1e12])assert.throws(()=>optimizeBuild({products:singleBuild(),budget}),RangeError);
  for(const unit of [0,-1,NaN,.00001])assert.throws(()=>optimizeBuild({products:singleBuild(),budget:1000,unit}),RangeError);
  for(const price of [null,undefined,-1,0,Infinity,NaN,1e20,.001,1e-9]) {
    const products=singleBuild();products[0].price=price;assert.throws(()=>optimizeBuild({products,budget:1000}),RangeError);
  }
  assert.throws(()=>optimizeBuild({products:singleBuild(),budget:1000,pri:{graphics:0,processing:3,memory:3}}),RangeError);
  assert.throws(()=>backtrackSearch({products:singleBuild(),maxNodes:-1}),RangeError);
  assert.throws(()=>search([...singleBuild(),singleBuild()[0]]),RangeError);
  assert.equal(optimizeBuild({products:[],budget:1000}).ok,false);
  assert.equal(optimizeBuild({products:singleBuild(),budget:0}).ok,false);
});

test('greedy formula, ordering and every decision match an independent reference',()=>{
  for(const budget of [0,100,1500,3000,10000])for(const cover of [7,14,30]) {
    const products=greedyFixture(),r=restockPlan(products,budget,cover),ref=greedyReference(products,budget,cover);
    assert.deepEqual(r.cands.map(x=>({id:x.id,qty:x.qty,urgency:x.urgency,orderQty:x.orderQty,decision:x.decision})),
      ref.map(({id,qty,urgency,orderQty,decision})=>({id,qty,urgency,orderQty,decision})));
    assert.equal(r.remaining,ref.at(-1)?.remaining??budget);
    if(r.knapsack)assert.equal(r.knapsack.value,fullOrderOracle(r.cands,budget));
  }
});

test('greedy ties are reproducible and minimum order is not a pack multiple',()=>{
  const products=[restockItem('tie-z'),restockItem('tie-a')];
  assert.deepEqual(restockPlan(products,2000).cands.map(r=>r.id),['tie-a','tie-z']);
  assert.deepEqual(restockPlan(products,2000).cands.map(r=>r.id),restockPlan([...products].reverse(),2000).cands.map(r=>r.id));
  const p=restockPlan([restockItem('moq',{stock:1,minStock:3,dailySales:2,leadTime:5,moq:10})],1e6);
  assert.equal(p.cands[0].qty,26);
});

test('greedy rejects unsafe inventory and accepts missing demand as zero',()=>{
  for(const patch of [{stock:-1},{stock:1.5},{minStock:-1},{dailySales:-1},{dailySales:Infinity},{leadTime:0},{cost:0},{cost:null},{moq:-1}])
    assert.throws(()=>restockPlan([restockItem('bad',patch)],1000),RangeError);
  for(const budget of [-1,NaN,Infinity])assert.throws(()=>restockPlan([],budget),RangeError);
  assert.equal(restockPlan([restockItem('unknown',{dailySales:undefined})],100).cands.length,0);
  assert.equal(restockPlan([],0).remaining,0);
  const high=restockPlan([restockItem('high-demand',{dailySales:1e6})],1e6);
  assert.equal(high.selected[0].orderQty,10000);assert.equal(high.remaining,0);assert.equal(high.selected[0].urgency,100);
});

test('representative search bounds and large restock inventory do not use strict timing assertions',()=>{
  const products=singleBuild().flatMap(p=>Array.from({length:10},(_,i)=>({...structuredClone(p),id:p.id+'-'+i})));
  const r=backtrackSearch({products,maxNodes:100,maxSolutions:1000,traceLimit:5});
  assert.equal(r.stopped,'nodes');assert.equal(r.stats.explored,100);assert.equal(r.trace.length,5);
  const plan=restockPlan(Array.from({length:2000},(_,i)=>restockItem('large-'+String(i).padStart(5,'0'))),2e6);
  assert.equal(plan.cands.length,2000);assert.equal(plan.knapsack,null,'reference memory guard');
  assert.ok(plan.remaining>=0);assert.equal(new Set(plan.cands.map(r=>r.rank)).size,2000);
});

test('DP reconstructs choices beyond the old signed-16-bit index limit',()=>{
  const products=singleBuild().filter(p=>!['gpu','psu'].includes(p.category));
  const source=singleBuild();
  for(let i=0;i<181;i++)products.push({...structuredClone(source.find(p=>p.category==='gpu')),id:'gpu-'+String(i).padStart(3,'0'),perf:{gaming:100*i/180,work:50}});
  for(let i=0;i<182;i++)products.push({...structuredClone(source.find(p=>p.category==='psu')),id:'psu-'+String(i).padStart(3,'0'),perf:{score:100*i/181}});
  const r=optimizeBuild({products,budget:800});
  assert.equal(r.ok,true);assert.ok(r.maxK>32767);assert.equal(r.sel.gpu,'gpu-180');assert.equal(r.sel.psu,'psu-181');
});

test('missing or invalid specifications stay unverified and archived products are excluded without mutating inputs',()=>{
  const products=singleBuild();delete products.find(p=>p.category==='cooler').specs;
  const selected=Object.fromEntries(products.map(p=>[p.category,p.id]));
  assert.equal(checkBuild(selected,indexProducts(products)).overall,'unverified');
  const invalid=singleBuild();invalid[0].specs.socket='AM9';invalid[1].specs.socket='AM9';assert.equal(search(invalid).solutions.length,0);
  const active=singleBuild(),snapshot=structuredClone(active);search(active);optimizeBuild({products:active,budget:1000});restockPlan(active,1000);
  assert.deepEqual(active,snapshot);
  active.find(p=>p.category==='ram').archived=true;assert.equal(search(active).solutions.length,0);assert.equal(optimizeBuild({products:active,budget:1000}).ok,false);
  assert.ok(!restockPlan(active,1000).cands.some(r=>r.id==='ram-one'));
});

test('optimizer save uses one catalog snapshot so persisted totals cannot drift between reads',async()=>{
  let reads=0,persisted;
  const inventory={listActive:async()=>{reads++;return singleBuild().map(p=>({...p,price:reads===1?100:200}));}};
  const service=optimizerService({inventory,plans:{saveOptimizationRun:async p=>{persisted=p;return 'saved';}}});
  const out=await service.saveRun({budget:15000}, {id:'test'});
  assert.equal(out.rec.ok,true);assert.equal(reads,1);assert.equal(persisted.totalPrice,persisted.build.totalPrice);
  assert.equal(persisted.build.components.reduce((s,c)=>s+cents(c.unitPrice),0),cents(persisted.totalPrice));
});
