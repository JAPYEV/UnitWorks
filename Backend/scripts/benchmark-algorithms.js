// Reproducible observations, not a complexity proof or a performance gate.
// No environment file, database, credentials or external services are used.
import {performance} from 'node:perf_hooks';
import {backtrackSearch,optimizeBuild,restockPlan} from '../../shared/uw-core.js';
import {SEED_PRODUCTS} from './seed-data.js';
import {singleBuild,restockItem} from '../test/fixtures/phase3-catalog.js';
function measure(name,run,summarize) {
  const started=performance.now(),result=run();
  console.log(JSON.stringify({name,durationMs:Number((performance.now()-started).toFixed(2)),...summarize(result)}));
}
measure('demo catalog backtracking',()=>backtrackSearch({products:SEED_PRODUCTS}),r=>({space:r.space,explored:r.stats.explored,checks:r.stats.checks,solutions:r.solutions.length,stopped:r.stopped}));
measure('demo catalog DP / 70000 pesos',()=>optimizeBuild({products:SEED_PRODUCTS,budget:70000}),r=>({ok:r.ok,platforms:r.anchorsTotal,transitions:r.states,winningBudgetStates:r.cap+1,maxOptions:r.maxK,total:r.total,score:r.score}));
measure('demo catalog greedy + reference / 300000 pesos',()=>restockPlan(SEED_PRODUCTS,300000),r=>({candidates:r.cands.length,selected:r.selected.length,spent:r.totalCost,referenceComputed:!!r.knapsack}));
const broad=singleBuild().flatMap(p=>Array.from({length:10},(_,i)=>({...structuredClone(p),id:p.id+'-'+i})));
measure('broad search / 100-node cap',()=>backtrackSearch({products:broad,maxNodes:100,maxSolutions:1000,traceLimit:5}),r=>({space:r.space,explored:r.stats.explored,stopped:r.stopped}));
const large=Array.from({length:2000},(_,i)=>restockItem('large-'+String(i).padStart(5,'0')));
measure('2000 restock products / 2000000 pesos',()=>restockPlan(large,2000000),r=>({candidates:r.cands.length,selected:r.selected.length,spent:r.totalCost,referenceComputed:!!r.knapsack}));
