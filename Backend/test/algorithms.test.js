// Algorithm tests, independent of the UI and the database. Optimization results are compared
// against brute-force enumeration of every combination.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  IGPU, SEARCH_ORDER, CATEGORIES, indexProducts, checkBuild, feasible, backtrackSearch, optimizeBuild,
  weightsFor, scoreBuild, restockPlan, candidatesFor
} from '../../shared/uw-core.js';
import { SEED_PRODUCTS } from '../scripts/seed-data.js';

const clone = o => JSON.parse(JSON.stringify(o));
const catalog = () => clone(SEED_PRODUCTS);

/** Every combination with one candidate per category. */
function* combos(products, { inStockOnly = false, gpuOptions } = {}) {
  const lists = SEARCH_ORDER.map(c => (c === 'gpu' && gpuOptions ? gpuOptions : candidatesFor(products, c, inStockOnly)));
  const idx = new Array(lists.length).fill(0);
  if (lists.some(l => !l.length)) return;
  while (true) {
    const b = {};
    SEARCH_ORDER.forEach((c, i) => { b[c] = lists[i][idx[i]]; });
    yield b;
    let k = lists.length - 1;
    while (k >= 0 && ++idx[k] === lists[k].length) { idx[k] = 0; k--; }
    if (k < 0) return;
  }
}
const price = b => Object.values(b).reduce((s, p) => s + p.price, 0);

describe('compatibility rules', () => {
  const byId = indexProducts(catalog());
  const full = { cpu: 'cpu-r5-5600', motherboard: 'mb-b550m-vdh', ram: 'ram-lpx-32-d4', gpu: 'gpu-rx7600', cooler: 'cool-hyper212-blk', psu: 'psu-cx650', storage: 'ssd-990evo-1t', case: 'case-forge-m2' };

  test('a complete matching build is compatible', () => {
    const r = checkBuild(full, byId);
    assert.equal(r.overall, 'compatible');
    assert.equal(r.passes.length, 11);
  });
  test('socket and memory mismatches are detected', () => {
    const r = checkBuild({ ...full, cpu: 'cpu-r5-7600', ram: 'ram-fury-32-d5' }, byId);
    assert.equal(r.overall, 'incompatible');
    // AM5 CPU on an AM4 board; DDR5 kit on a DDR4 board. The cooler supports AM5, so it still passes.
    assert.deepEqual(r.fails.map(f => f.id).sort(), ['memory', 'socket']);
  });
  test('integrated graphics requires a CPU with an iGPU', () => {
    assert.ok(checkBuild({ ...full, gpu: 'igpu' }, byId).fails.some(f => f.id === 'display'));
    assert.ok(!checkBuild({ ...full, cpu: 'cpu-r5-5600g', gpu: 'igpu' }, byId).fails.some(f => f.id === 'display'));
  });
  test('missing specifications are "unverified", never assumed compatible', () => {
    const r = checkBuild({ ...full, gpu: 'gpu-rtx3050-6g' }, byId); // card length unknown
    assert.equal(r.overall, 'unverified');
    assert.ok(r.unknowns.some(u => u.id === 'gpuClear'));
  });
  test('PSU wattage and connectors', () => {
    const r = checkBuild({ ...full, cpu: 'cpu-i7-14700k', motherboard: 'mb-z790-prors', ram: 'ram-flare-32-d5', gpu: 'gpu-rx7800xt', cooler: 'cool-lf3-240', psu: 'psu-mwe550', case: 'case-air903' }, byId);
    assert.ok(r.fails.some(f => f.id === 'psuWatt'));
    assert.ok(r.fails.some(f => f.id === 'psuConn'));
  });
  test('a partial build is incomplete with pending checks', () => {
    const r = checkBuild({ cpu: 'cpu-r5-5600' }, byId);
    assert.equal(r.overall, 'incomplete');
    assert.equal(r.checks.filter(c => c.status === 'pending').length, 11);
  });
});

describe('backtracking search', () => {
  test('finds exactly the brute-force set of valid builds within a budget', () => {
    const products = catalog(), budget = 42000;
    const brute = new Set();
    for (const b of combos(products)) if (price(b) <= budget && feasible(b)) brute.add(SEARCH_ORDER.map(c => b[c].id).join('|'));
    const r = backtrackSearch({ products, budget, maxSolutions: 100000, maxNodes: 10_000_000, traceLimit: 0 });
    assert.equal(r.stopped, null);
    const found = new Set(r.solutions.map(s => SEARCH_ORDER.map(c => s.sel[c]).join('|')));
    assert.equal(found.size, brute.size);
    for (const k of brute) assert.ok(found.has(k), `missing ${k}`);
    assert.ok(brute.size > 0);
  });
  test('every returned solution passes all constraints and respects locks', () => {
    const products = catalog();
    const r = backtrackSearch({ products, locked: { cpu: 'cpu-i5-12400f', case: 'case-h5-flow' }, maxSolutions: 25 });
    const byId = indexProducts(products);
    assert.ok(r.solutions.length > 0);
    for (const s of r.solutions) {
      assert.equal(s.sel.cpu, 'cpu-i5-12400f');
      assert.equal(s.sel.case, 'case-h5-flow');
      assert.equal(checkBuild(s.sel, byId).fails.length, 0);
    }
    for (let i = 1; i < r.solutions.length; i++) assert.ok(r.solutions[i - 1].total <= r.solutions[i].total);
  });
  test('pruning explores far fewer nodes than the full space', () => {
    const r = backtrackSearch({ products: catalog(), maxSolutions: 12 });
    assert.ok(r.stats.explored < r.space / 100);
    assert.equal(r.stats.pruned, r.rejections.reduce((s, x) => s + x.count, 0));
  });
  test('trace records prunes, backtracks and solutions', () => {
    const r = backtrackSearch({ products: catalog(), locked: { cpu: 'cpu-i5-12400f' }, maxSolutions: 3, traceLimit: 500 });
    const kinds = new Set(r.trace.map(t => t.kind));
    for (const k of ['ok', 'prune', 'solution']) assert.ok(kinds.has(k), `trace lacks ${k}`);
    assert.equal(r.trace.filter(t => t.kind === 'solution').length, r.solutions.length);
  });
  test('incompatible locks and empty inventory give no solutions', () => {
    const r = backtrackSearch({ products: catalog(), locked: { cpu: 'cpu-r5-7600', motherboard: 'mb-a520m-k' } });
    assert.equal(r.solutions.length, 0);
    assert.ok(r.rejections.some(x => x.key === 'socket'));
    const empty = backtrackSearch({ products: [] });
    assert.equal(empty.solutions.length, 0);
    assert.equal(empty.space, 0);
  });
  test('in-stock-only search never uses out-of-stock parts', () => {
    const products = catalog(), byId = indexProducts(products);
    const r = backtrackSearch({ products, inStockOnly: true, maxSolutions: 50 });
    for (const s of r.solutions) for (const id of Object.values(s.sel)) assert.ok(id === 'igpu' || byId[id].stock > 0);
  });
});

describe('dynamic programming optimizer', () => {
  /** Exhaustive optimum: highest weighted score among compatible in-stock builds within budget. */
  function bruteBest(products, { budget, useCase, pri, roundUp = 0 }) {
    const w = weightsFor(useCase, pri), byId = indexProducts(products);
    const cost = b => (roundUp ? Object.values(b).reduce((s, p) => s + Math.ceil(p.price / roundUp) * roundUp, 0) : price(b));
    let best = null;
    const inStock = products.filter(p => p.stock > 0);
    for (const b of combos(inStock)) {
      if (cost(b) > budget || !feasible(b)) continue;
      const sel = Object.fromEntries(Object.entries(b).map(([k, p]) => [k, p.id]));
      const s = scoreBuild(sel, byId, useCase, w);
      if (!best || s > best.score + 1e-9) best = { score: s, sel, total: price(b) };
    }
    return best;
  }

  test('matches brute force exactly when prices are multiples of the ₱100 step', () => {
    const products = catalog().map(p => ({ ...p, price: Math.round(p.price / 100) * 100 }));
    for (const [budget, useCase] of [[45000, 'Gaming'], [60000, 'Programming'], [90000, 'Content Creation']]) {
      const pri = { graphics: 3, processing: 3, memory: 3 };
      const dp = optimizeBuild({ products, budget, useCase, pri });
      const bf = bruteBest(products, { budget, useCase, pri });
      assert.ok(dp.ok && bf);
      assert.ok(Math.abs(dp.score - bf.score) < 1e-9, `${useCase} ₱${budget}: DP ${dp.score} vs brute ${bf.score}`);
      assert.ok(dp.total <= budget);
    }
  });

  test('with real prices, never exceeds the budget and is optimal under its rounded-up costs', () => {
    const products = catalog(), budget = 55000, useCase = 'Gaming', pri = { graphics: 4, processing: 2, memory: 3 };
    const dp = optimizeBuild({ products, budget, useCase, pri });
    const exact = bruteBest(products, { budget, useCase, pri });
    const rounded = bruteBest(products, { budget, useCase, pri, roundUp: 100 });
    assert.ok(dp.total <= budget);
    assert.ok(dp.score <= exact.score + 1e-9);
    // DP rounds costs up to ₱100 steps for parts after the platform, so it is at least as good as the
    // exhaustive optimum when every part is rounded up.
    assert.ok(dp.score >= rounded.score - 1e-9);
  });

  test('recommended build is fully compatible and uses only in-stock parts', () => {
    const products = catalog(), byId = indexProducts(products);
    const dp = optimizeBuild({ products, budget: 70000, useCase: 'Gaming' });
    assert.equal(checkBuild(dp.sel, byId).overall, 'compatible');
    for (const id of Object.values(dp.sel)) assert.ok(id === 'igpu' || byId[id].stock > 0);
    assert.equal(Object.keys(dp.sel).length, CATEGORIES.length);
  });

  test('insufficient budget reports the cheapest feasible cost', () => {
    const products = catalog();
    const dp = optimizeBuild({ products, budget: 15000, useCase: 'Office Work' });
    assert.equal(dp.ok, false);
    assert.ok(dp.minFeasible > 15000);
    const exactMin = Math.min(...[...combos(products.filter(p => p.stock > 0))].filter(feasible).map(price));
    assert.ok(dp.minFeasible >= exactMin);
  });

  test('constraints: brand filters and minimum memory are honoured', () => {
    const products = catalog(), byId = indexProducts(products);
    const dp = optimizeBuild({ products, budget: 120000, useCase: 'Content Creation', cpuBrand: 'Intel', gpuBrand: 'NVIDIA', minRam: 64 });
    assert.ok(dp.ok);
    assert.equal(byId[dp.sel.cpu].brand, 'Intel');
    assert.equal(byId[dp.sel.gpu].specs.chipBrand, 'NVIDIA');
    assert.equal(byId[dp.sel.ram].specs.capacity, 64);
  });

  test('empty inventory is infeasible, not an error', () => {
    const dp = optimizeBuild({ products: [], budget: 50000 });
    assert.equal(dp.ok, false);
    assert.equal(dp.minFeasible, null);
  });

  test('state count matches the documented O(P·G·B·K) bound', () => {
    const dp = optimizeBuild({ products: catalog(), budget: 70000, useCase: 'Gaming' });
    const bound = dp.anchorsFeasible * 4 * (Math.floor(70000 / dp.unit) + 1) * dp.maxK;
    assert.ok(dp.states > 0 && dp.states <= bound);
  });
});

describe('greedy restock', () => {
  const item = (id, o) => ({ id, name: id, category: 'ram', stock: 0, minStock: 2, dailySales: 1, leadTime: 7, moq: 1, cost: 1000, price: 1500, ...o });

  test('candidates are ranked by urgency and the budget is never exceeded', () => {
    const plan = restockPlan(catalog(), 300000, 7);
    for (let i = 1; i < plan.cands.length; i++) assert.ok(plan.cands[i - 1].urgency >= plan.cands[i].urgency);
    assert.ok(plan.totalCost <= 300000);
    assert.equal(plan.totalCost + plan.remaining, 300000);
    assert.equal(plan.selected.reduce((s, r) => s + r.orderCost, 0), plan.totalCost);
  });

  test('each decision follows the stated rules', () => {
    const plan = restockPlan(catalog(), 250000, 14);
    for (const st of plan.steps) {
      const r = st.r;
      if (st.decision === 'selected') assert.equal(r.orderQty, r.qty);
      if (st.decision === 'partial') { assert.ok(r.orderQty >= r.moq && r.orderQty < r.qty); assert.ok(r.cost > st.before); }
      if (st.decision === 'skipped') assert.ok(r.moq * r.unitCost > st.before || Math.floor(st.before / r.unitCost) < r.moq);
      assert.equal(st.before - st.after, r.orderCost);
    }
  });

  test('order quantity covers lead time plus coverage, rounded up to the MOQ', () => {
    const [r] = restockPlan([item('a', { stock: 1, minStock: 3, dailySales: 2, leadTime: 5, moq: 10 })], 1e6, 7).cands;
    // target = ceil(3 + 2 × (5 + 7)) = 27, need = 26, MOQ 10 → 26
    assert.equal(r.target, 27);
    assert.equal(r.qty, 26);
    const [m] = restockPlan([item('b', { stock: 2, minStock: 2, dailySales: 0.1, leadTime: 5, moq: 20 })], 1e6, 7).cands;
    assert.equal(m.qty, 20);
  });

  test('items above the reorder point or with no demand are not candidates', () => {
    const plan = restockPlan([item('full', { stock: 500 }), item('dead', { stock: 0, dailySales: 0 })], 1e6, 7);
    assert.equal(plan.cands.length, 0);
    assert.equal(plan.notNeeded, 2);
  });

  test('zero budget skips everything; empty inventory yields an empty plan', () => {
    const plan = restockPlan(catalog(), 0, 7);
    assert.equal(plan.selected.length, 0);
    assert.equal(plan.skipped.length, plan.cands.length);
    const empty = restockPlan([], 1000, 7);
    assert.equal(empty.cands.length, 0);
    assert.equal(empty.remaining, 1000);
  });

  test('out-of-stock items with demand rank above slow, well-stocked items', () => {
    const plan = restockPlan([item('slow', { stock: 3, minStock: 3, dailySales: 0.2 }), item('empty', { stock: 0, dailySales: 0.2 })], 1e6, 7);
    assert.equal(plan.cands[0].id, 'empty');
  });

  test('greedy is not always optimal: one urgent expensive order can crowd out several cheaper ones', () => {
    const products = [
      item('big', { stock: 0, dailySales: 2, cost: 9000, moq: 1, minStock: 0, leadTime: 1 }),
      item('s1', { stock: 0, dailySales: 1.9, cost: 1000, moq: 1, minStock: 0, leadTime: 1 }),
      item('s2', { stock: 0, dailySales: 1.9, cost: 1000, moq: 1, minStock: 0, leadTime: 1 }),
      item('s3', { stock: 0, dailySales: 1.9, cost: 1000, moq: 1, minStock: 0, leadTime: 1 })
    ];
    // Budget exactly covers the big order; the three small orders together would fit it too.
    const budget = restockPlan(products, 1e9, 7).cands.find(r => r.id === 'big').cost;
    const plan = restockPlan(products, budget, 7);
    assert.equal(plan.cands[0].id, 'big');
    assert.equal(plan.selected.length, 1);
    assert.ok(plan.knapsack.value > plan.greedyValue);
  });
});

test('integrated graphics option is virtual and free', () => {
  assert.equal(IGPU.price, 0);
  assert.ok(candidatesFor([], 'gpu', true).includes(IGPU));
});
