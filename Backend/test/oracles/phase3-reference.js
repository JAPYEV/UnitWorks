// Independent specifications. Do not import any production algorithm/helper.
export const cats=['cpu','motherboard','ram','gpu','cooler','psu','storage','case'];
const integrated={id:'igpu',category:'gpu',virtual:true,price:0,specs:{},perf:{gaming:8,work:12}};
export const cents = value => { const [whole,fraction]=value.toFixed(2).split('.');return Number(whole)*100+Number(fraction); };
const numeric = v => typeof v==='number' && Number.isFinite(v) && v>=0;
const members = v => typeof v==='string'?v.split(',').map(s=>s.trim()):[];
export function compatible(b) {
  if(cats.some(c=>!b[c]))return false;
  const c=b.cpu.specs||{},m=b.motherboard.specs||{},r=b.ram.specs||{},g=b.gpu.specs||{},k=b.case.specs||{},h=b.cooler.specs||{},p=b.psu.specs||{},s=b.storage.specs||{};
  const v=b.gpu.virtual;
  return !!c.socket && c.socket===m.socket && !!r.type && r.type===m.memType && members(k.forms).includes(m.form)
    && (!v||c.igpu==='Yes') && (v||(numeric(g.length)&&numeric(k.maxGpu)&&g.length<=k.maxGpu))
    && members(h.sockets).includes(c.socket)
    && (h.type==='Air'?(numeric(h.height)&&numeric(k.maxCooler)&&h.height<=k.maxCooler):h.type==='AIO'&&(numeric(h.radiator)&&numeric(k.maxRad)&&h.radiator<=k.maxRad))
    && numeric(h.rating)&&numeric(c.maxPower)&&h.rating>=c.maxPower
    && numeric(p.watt)&&(v||numeric(g.power))&&p.watt>=50*Math.ceil((c.maxPower+(v?0:g.power)+75)*1.25/50)
    && (v||(g.hpwr==='Yes'?(p.hpwr==='Yes'||(numeric(p.pcie8)&&p.pcie8>=2)):g.hpwr==='No'&&numeric(g.pcie8)&&(g.pcie8===0||(numeric(p.pcie8)&&p.pcie8>=g.pcie8))))
    && (s.iface==='NVMe'?numeric(m.m2)&&m.m2>=1:s.iface==='SATA'&&numeric(m.sata)&&m.sata>=1);
}
export function enumerate(products,{budget=Infinity,locked={},inStockOnly=false,gpuBrand='Any',cpuBrand='Any',minRam=0}={}) {
  const lists=cats.map(cat=>products.filter(p=>p.category===cat&&(!inStockOnly||p.stock>0)&&!p.archived)
    .concat(cat==='gpu'&&gpuBrand==='Any'?[integrated]:[])
    .filter(p=>(!locked[cat]||p.id===locked[cat])&&(cat!=='cpu'||cpuBrand==='Any'||p.brand===cpuBrand)
      &&(cat!=='gpu'||gpuBrand==='Any'||p.specs.chipBrand===gpuBrand)&&(cat!=='ram'||p.specs.capacity>=minRam)));
  const result=[];
  const visit=(i,b)=>{if(i===cats.length){const cost=cats.reduce((v,c)=>v+cents(b[c].price),0);if(cost<=Math.round(budget*100)&&compatible(b))result.push({b:{...b},total:cost/100,sel:Object.fromEntries(cats.map(c=>[c,b[c].id]))});return;}
    for(const p of lists[i])visit(i+1,{...b,[cats[i]]:p});};
  visit(0,{});return result;
}
const weights={Gaming:[.24,.46,.12,.08,.05,.05],Programming:[.38,.08,.28,.16,.05,.05],
  'Office Work':[.30,.04,.22,.24,.10,.10],'Content Creation':[.34,.28,.22,.10,.03,.03]};
export function objective(b,{useCase='Gaming',pri={graphics:3,processing:3,memory:3},lean=false,budget,unit=100}) {
  const names=['cpu','gpu','ram','storage','cooler','psu'];
  const priority=[pri.processing,pri.graphics,pri.memory,pri.memory,pri.processing,3];
  const values=weights[useCase].map((w,i)=>w*priority[i]/3),sum=values.reduce((a,b)=>a+b,0);
  const score=names.reduce((a,c,i)=>a+values[i]/sum*(b[c].perf?.[c==='cpu'||c==='gpu'?(useCase==='Gaming'?'gaming':'work'):'score']??50),0);
  const platform=cents(b.cpu.price)+cents(b.motherboard.price)+cents(b.case.price);
  const rounded=[cents(b.ram.price),cents(b.gpu.price)+cents(b.psu.price),cents(b.cooler.price),cents(b.storage.price)]
    .reduce((a,v)=>a+Math.ceil(v/cents(unit))*cents(unit),platform);
  return {score,rounded:rounded/100,objective:score-(lean?15*rounded/cents(budget):0)};
}
export function bruteBest(products,opts) {
  let best=null;
  for(const result of enumerate(products,{...opts,inStockOnly:opts.excludeOOS!==false})) {
    const metrics=objective(result.b,opts);
    if(metrics.rounded>opts.budget)continue;
    if(!best||metrics.objective>best.objective+1e-9||Math.abs(metrics.objective-best.objective)<1e-9&&result.total<best.total)best={...result,...metrics};
  }return best;
}
export function greedyReference(products,budget,cover=7) {
  const max=Math.max(.1,...products.map(p=>p.dailySales??0));
  const ranked=products.filter(p=>(p.dailySales??0)>0&&p.stock<=Math.ceil(p.dailySales*p.leadTime+p.minStock))
    .map(p=>{const daily=p.dailySales,qty=Math.max(p.moq,Math.ceil(p.minStock+daily*(p.leadTime+cover))-p.stock);
      return {id:p.id,daily,qty,urgency:Math.round(20*Math.min(p.leadTime/Math.max(p.stock/daily,.5),3)+40*daily/max),unitCost:cents(p.cost),moq:p.moq};})
    .sort((a,b)=>b.urgency-a.urgency||b.daily-a.daily||(a.id<b.id?-1:a.id>b.id?1:0));
  let left=cents(budget);
  return ranked.map(r=>{const orderQty=Math.min(r.qty,Math.floor(left/r.unitCost));const actual=orderQty>=r.moq?orderQty:0;left-=actual*r.unitCost;
    return {...r,orderQty:actual,decision:actual===r.qty?'selected':actual?'partial':'skipped',remaining:left/100};});
}
export function fullOrderOracle(rows,budget) {
  let best=0;for(let mask=0;mask<2**rows.length;mask++){let cost=0,value=0;rows.forEach((r,i)=>{if(mask&(1<<i)){cost+=Math.ceil(cents(r.cost)/10000)*10000;value+=r.urgency;}});if(cost<=cents(budget))best=Math.max(best,value);}return best;
}
