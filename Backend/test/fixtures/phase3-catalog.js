// Synthetic fixtures: no production records or production algorithm imports.
const base = [
  ['cpu',{socket:'AM4',maxPower:65,igpu:'No'}],
  ['motherboard',{socket:'AM4',memType:'DDR4',form:'Micro-ATX',m2:1,sata:1}],
  ['ram',{type:'DDR4',capacity:16,speed:3200}],
  ['gpu',{length:200,power:100,pcie8:1,hpwr:'No',chipBrand:'NVIDIA'}],
  ['cooler',{type:'Air',sockets:'AM4',height:120,rating:100}],
  ['psu',{watt:500,pcie8:2,hpwr:'No'}],
  ['storage',{iface:'NVMe',capacity:1000}],
  ['case',{forms:'Micro-ATX',maxGpu:300,maxCooler:160,maxRad:240}]
];
export const singleBuild = () => base.map(([category,specs])=>({id:category+'-one',category,name:category+' fixture',brand:'AMD',
  price:100,cost:50,stock:5,minStock:2,dailySales:1,leadTime:7,moq:1,specs:structuredClone(specs),perf:{gaming:50,work:50,score:50}}));
export const backtrackingFixture = () => {
  const rows=singleBuild();
  rows.push({...structuredClone(rows.find(p=>p.category==='ram')),id:'ram-two',price:120});
  rows.push({...structuredClone(rows.find(p=>p.category==='cpu')),id:'cpu-bad',specs:{socket:'AM5',maxPower:65,igpu:'No'}});
  return rows;
};
export const dpFixture = () => {
  const rows=singleBuild();
  rows.push({...structuredClone(rows.find(p=>p.category==='ram')),id:'ram-fast',price:200,perf:{score:90}});
  rows.push({...structuredClone(rows.find(p=>p.category==='gpu')),id:'gpu-fast',price:300,perf:{gaming:95,work:85}});
  return rows;
};
export const restockItem = (id,over={}) => ({id,category:'ram',name:id,price:150,cost:100,stock:0,minStock:2,dailySales:1,leadTime:7,moq:1,...over});
export const greedyFixture = () => [restockItem('restock-a'),restockItem('restock-b',{stock:3,dailySales:2,cost:125}),
  restockItem('restock-c',{stock:100}),restockItem('restock-d',{dailySales:0})];
