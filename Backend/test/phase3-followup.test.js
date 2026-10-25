// Follow-up regressions use synthetic catalogs only; no environment or live database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeBuild, restockPlan, checkBuild, indexProducts, peso } from '../../shared/uw-core.js';
import { singleBuild, restockItem } from './fixtures/phase3-catalog.js';
import { runOptimizer, optimizerService } from '../src/services/algorithmServices.js';

test('decimal demand does not add a phantom unit to an exact restock target', () => {
  const plan = restockPlan([restockItem('decimal-target', { stock: 0, minStock: 0, dailySales: .28, leadTime: 18 })], 10000, 7);
  assert.equal(plan.cands[0].target, 7); // 0.28 * (18 + 7) = 7 exactly
  assert.equal(plan.cands[0].qty, 7);
});

test('decimal demand does not move the reorder threshold by one unit', () => {
  const plan = restockPlan([restockItem('decimal-threshold', { stock: 8, minStock: 0, dailySales: .28, leadTime: 25 })], 10000);
  assert.equal(plan.rows[0].rop, 7);
  assert.equal(plan.cands.length, 0);
});

test('decimal demand ceilings preserve genuine fractional demand, including scientific notation', () => {
  for (const [dailySales, leadTime, expected] of [[.14, 43, 7], [.07, 93, 7], [.29, 93, 29], [.28, 19, 8], [1e-7, 9999993, 1]]) {
    const plan = restockPlan([restockItem('boundary', { stock: 0, minStock: 0, dailySales, leadTime })], 10000);
    assert.equal(plan.rows[0].target, expected, `${dailySales} * (${leadTime} + 7)`);
  }
});

test('DP remaining budget is an exact cent amount consistent with the selected build', () => {
  const products = singleBuild();
  products.find(p => p.category === 'ram').price = 100.1;
  const result = optimizeBuild({ products, budget: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.total, 800.1);
  assert.equal(result.remaining, 199.9);
  assert.equal(checkBuild(result.sel, indexProducts(products)).total, result.total);
});

test('currency labels preserve cents used by algorithm totals and traces', () => {
  assert.equal(peso(800.1), '₱800.10');
  assert.equal(peso(1000), '₱1,000');
  assert.equal(peso(-.2), '−₱0.20');
});

test('each optimizer alternative exposes reproducible inputs for saving the selected configuration', async () => {
  const products = singleBuild();
  const input = { budget: 20000, useCase: 'Gaming', pri: { graphics: 3, processing: 3, memory: 3 }, cpuBrand: 'Any', gpuBrand: 'Any', minRam: 0, excludeOOS: true, lean: false };
  const out = runOptimizer(products, input);
  assert.equal(out.alts.length, 3);
  let saved;
  const service = optimizerService({ inventory: { listActive: async () => products }, plans: { saveOptimizationRun: async p => { saved = p; return 'test-run'; } } });
  for (const alternative of out.alts) {
    assert.ok(alternative.input, alternative.key);
    const result = await service.saveRun(alternative.input, { id: 'test-actor' });
    assert.deepEqual(result.rec.sel, alternative.r.sel);
    assert.equal(saved.budget, alternative.input.budget);
    assert.equal(saved.totalPrice, alternative.r.total);
    assert.equal(saved.priorityGraphics, alternative.input.pri.graphics);
  }
  assert.deepEqual(input.pri, { graphics: 3, processing: 3, memory: 3 });
});

test('hundredth-unit demand boundaries agree with integer arithmetic', () => {
  for (let hundredths = 1; hundredths < 100; hundredths++) {
    for (const days of [8, 10, 25, 50, 100]) {
      const expected = Math.floor((hundredths * days + 99) / 100) + 2;
      const plan = restockPlan([restockItem('exact-grid', { stock: 0, minStock: 2, dailySales: hundredths / 100, leadTime: days - 7 })], 0);
      assert.equal(plan.rows[0].target, expected, `${hundredths}/100 * ${days}`);
    }
  }
});

test('every alternative at the minimum API budget can be submitted to save without a budget validation error', async () => {
  const input = { budget: 15000, useCase: 'Gaming', pri: { graphics: 3, processing: 3, memory: 3 } };
  const products = singleBuild();
  const out = runOptimizer(products, input);
  assert.ok(out.alts.every(a => a.input.budget >= 15000));
  const service = optimizerService({ inventory: { listActive: async () => products }, plans: { saveOptimizationRun: async () => 'saved' } });
  for (const a of out.alts) assert.equal((await service.saveRun(a.input, { id: 'test' })).rec.ok, true);
});
