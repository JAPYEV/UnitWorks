// Render real algorithm/API responses with the existing React pages. No production env or data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { startApi } from '../../Backend/test/helpers.js';
import { backtrackSearch, optimizeBuild, restockPlan, indexProducts, peso } from '../../shared/uw-core.js';
import { singleBuild, restockItem } from '../../Backend/test/fixtures/phase3-catalog.js';

let api, vite, builder, optimizer, analysis;
const noOp = () => {};
const adminUi = { can: () => true, toast: noOp, go: noOp, setBuild: noOp };
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const input = { budget: 70000, useCase: 'Gaming', pri: { graphics: 3, processing: 3, memory: 3 }, cpuBrand: 'Any', gpuBrand: 'Any', minRam: 0, excludeOOS: true, lean: false };
const viewState = { view: 0, dpOpen: true };
before(async () => {
  api = await startApi(); // fresh PGlite + local signed tokens; never reads an env file
  vite = await createServer({
    configFile: false, envFile: false, root: fileURLToPath(new URL('../', import.meta.url)), logLevel: 'error',
    resolve: { alias: { '@shared': fileURLToPath(new URL('../../shared', import.meta.url)) } },
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] }
  });
  builder = await vite.ssrLoadModule('/src/pages/PCBuilder.jsx');
  optimizer = await vite.ssrLoadModule('/src/pages/BuildOptimizer.jsx');
  analysis = await vite.ssrLoadModule('/src/pages/AlgorithmAnalysis.jsx');
});
after(async () => { if (vite) await vite.close(); if (api) await api.close(); });

test('a node-capped empty search is displayed as incomplete, never as proof of incompatibility', () => {
  const products = singleBuild();
  const sr = { ...backtrackSearch({ products, maxNodes: 1 }), durationMs: 1 };
  const html = render(builder.SearchResults, { sr, s: { traceAll: false }, set: noOp, byId: indexProducts(products), api: adminUi, lockedN: 0 });
  assert.match(html, /search incomplete/);
  assert.match(html, /does not prove the parts are incompatible/);
  assert.doesNotMatch(html, /No valid configuration contains all locked parts|exhaustive search completed/);
});

test('an exhaustive impossible search is distinguished from an interrupted one', () => {
  const products = singleBuild();
  const sr = { ...backtrackSearch({ products, budget: 1 }), durationMs: 1 };
  const html = render(builder.SearchResults, { sr, s: { traceAll: false }, set: noOp, byId: indexProducts(products), api: adminUi, lockedN: 0 });
  assert.match(html, /exhaustive search completed/);
  assert.match(html, /No valid configuration contains all locked parts/);
  assert.doesNotMatch(html, /Unexplored combinations remain/);
});

test('staff backtracking API results render their actual total, product names and trace', async () => {
  const response = await api.post('/builds/search', { budget: 60000, inStockOnly: true }, 'staff');
  assert.equal(response.status, 200);
  const sr = response.body.data;
  const products = (await api.get('/inventory', 'staff')).body.data;
  const byId = indexProducts(products);
  const html = render(builder.SearchResults, { sr, s: { traceAll: false }, set: noOp, byId, api: adminUi, lockedN: 0 });
  assert.ok(sr.solutions.length > 0);
  assert.ok(html.includes(peso(sr.solutions[0].total)));
  assert.ok(html.includes(byId[sr.solutions[0].sel.cpu].name));
  assert.match(html, /Search trace/);
  assert.match(html, /capped search is not globally cheapest-K/);
});

test('DP API result snapshots take precedence over stale frontend inventory', async () => {
  const response = await api.post('/optimizer/recommendations', input, 'staff');
  assert.equal(response.status, 200);
  const out = response.body.data;
  const stale = out.rec.items.map(it => ({ ...it.product, name: 'STALE PRODUCT', price: 999999, perf: { gaming: 0, work: 0, score: 0 } }));
  const html = render(optimizer.Result, { ...out, run: out.input, s: viewState, set: noOp, products: stale, api: adminUi });
  assert.ok(html.includes(peso(out.rec.total)));
  assert.ok(html.includes(out.rec.score.toFixed(1)));
  assert.ok(html.includes(out.rec.items[0].product.name));
  assert.doesNotMatch(html, /STALE PRODUCT|NaN|Infinity/);
  assert.match(html, /Save this configuration/);
});

test('selected optimizer alternatives retain their reproducible inputs through save and staff cannot save', async () => {
  const out = (await api.post('/optimizer/recommendations', input, 'staff')).body.data;
  for (let i = 0; i < out.alts.length; i++) {
    const a = out.alts[i];
    const html = render(optimizer.Result, { ...out, run: out.input, s: { ...viewState, view: i + 1 }, set: noOp, products: [], api: adminUi });
    assert.ok(html.includes(peso(a.r.total)));
    assert.ok(html.includes(a.userScore.toFixed(1)));
    const saved = await api.post('/optimizer/runs', a.input, 'admin');
    assert.equal(saved.status, 201);
    assert.deepEqual(saved.body.data.rec.sel, a.r.sel);
    assert.equal(saved.body.data.input.budget, a.input.budget);
    assert.deepEqual(saved.body.data.input.pri, a.input.pri);
    assert.equal((await api.post('/optimizer/runs', a.input, 'staff')).status, 403);
  }
  const staffHtml = render(optimizer.Result, { ...out, run: out.input, s: viewState, set: noOp, products: [], api: { ...adminUi, can: () => false } });
  assert.doesNotMatch(staffHtml, /Save this configuration/);
});

test('rounded-domain infeasibility and cent-valued totals have accurate frontend explanations', () => {
  const products = singleBuild(); products.find(p => p.category === 'ram').price = 100.1;
  const rec = optimizeBuild({ products, budget: 800.1 });
  assert.equal(rec.ok, false); assert.equal(rec.minFeasible, 800.1);
  const html = render(optimizer.Fail, { rec, run: { ...input, budget: 800.1 } });
  assert.match(html, /conservative rounded group costs/);
  assert.ok(html.includes('₱800.10'));
  assert.doesNotMatch(html, /No compatible combination exists/);
});

test('analysis builders consume actual API counters, sampled DP cells and restock decisions', async () => {
  const products = (await api.get('/inventory', 'staff')).body.data;
  const bt = (await api.post('/builds/search', { maxSolutions: 1 }, 'staff')).body.data;
  const dp = (await api.post('/optimizer/recommendations', input, 'staff')).body.data;
  const gr = (await api.post('/restock/recommendations', { budget: 250000, coverDays: 14 }, 'staff')).body.data;
  const state = { btCpu: 'none', btBudget: 'none', dpBudget: '70000', dpUse: 'Gaming', grBudget: '250000' };
  const views = [analysis.backtrackingView(products, indexProducts(products), state, noOp, bt), analysis.dpView(state, noOp, { ...dp.rec, durationMs: dp.durationMs }), analysis.greedyView(state, noOp, gr)];
  for (const v of views) { assert.ok(v.sections.length >= 6); assert.ok(v.sections.some(s => s.title === 'Empirical measurement')); }
  assert.ok(JSON.stringify(views[0]).includes(String(bt.stats.explored)));
  assert.ok(JSON.stringify(views[1]).includes(dp.rec.items[0].product.name));
  assert.ok(JSON.stringify(views[2]).includes(gr.cands[0].name));
  assert.ok(dp.rec.table.rows.some(r => r.cells.some(c => c.v === null)), 'unreachable DP cells survive JSON as null');
});

test('greedy analysis preserves exact decimal-demand order quantities', () => {
  const plan = { ...restockPlan([restockItem('fractional-demand', { stock: 0, minStock: 0, dailySales: .28, leadTime: 18 })], 10000), durationMs: 1 };
  assert.equal(plan.cands[0].qty, 7);
  const view = analysis.greedyView({ grBudget: '10000' }, noOp, plan);
  assert.ok(JSON.stringify(view).includes('fractional-demand'));
  assert.equal(plan.totalCost, 700);
});


test('decimal demand survives the inventory API and reaches greedy results without a phantom unit', async () => {
  const created = await api.post('/inventory', { name: 'Decimal demand regression kit', brand: 'Synthetic', category: 'ram', price: 150, cost: 100, stock: 0, minStock: 0, dailySales: .28, leadTime: 18, moq: 1, specs: {} }, 'admin');
  assert.equal(created.status, 201);
  const response = await api.post('/restock/recommendations', { budget: 1000000, coverDays: 7 }, 'staff');
  assert.equal(response.status, 200);
  const row = response.body.data.cands.find(r => r.id === created.body.data.id);
  assert.ok(row);
  assert.equal(row.qty, 7);
  assert.equal(row.orderQty, 7);
  assert.equal(row.orderCost, 700);
});


test('search notices distinguish caps and analysis defaults work without a seeded CPU', () => {
  const capped = backtrackSearch({ products: singleBuild(), maxNodes: 1 });
  const notice = builder.searchNotice(capped);
  assert.equal(notice.title, 'Search limit reached');
  assert.match(notice.body, /unexplored configurations may remain/);
  const exhaustive = backtrackSearch({ products: [], maxNodes: 1 });
  assert.equal(builder.searchNotice(exhaustive).title, 'No valid configuration');
  const html = render(analysis.default, { products: [], dataVersion: 0 });
  assert.match(html, /<option value="none" selected="">None \(search all CPUs\)<\/option>/);
  assert.doesNotMatch(html, /cpu-i7-14700k/);
});


test('compatibility search labels stale locks, budgets and stock filters without discarding the recorded trace', () => {
  const products = singleBuild(), byId = indexProducts(products);
  const build = { cpu: products.find(p => p.category === 'cpu').id };
  const sr = { ...backtrackSearch({ products, locked: build, budget: 1000 }), durationMs: 1 };
  const s = { search: sr, budget: '1000', inStockOnly: false, searchInput: builder.searchInputKey(build, 1000, false) };
  const props = { build, s, set: noOp, byId, api: adminUi, runSearch: noOp };
  assert.doesNotMatch(render(builder.SearchPanel, props), /Search inputs changed/);
  for (const change of [{ build: {} }, { s: { ...s, budget: '999' } }, { s: { ...s, inStockOnly: true } }, { s: { ...s, searchInput: null } }]) {
    const html = render(builder.SearchPanel, { ...props, ...change });
    assert.match(html, /role="status"/);
    assert.match(html, /Search inputs changed/);
    assert.match(html, /Search trace/);
  }
  assert.equal(builder.searchInputKey({ cpu: build.cpu, gpu: null }, 1000, false), s.searchInput);
  const invalid = { ...s, budget: 'invalid', searchInput: builder.searchInputKey(build, null, false) };
  assert.match(render(builder.SearchPanel, { ...props, s: invalid }), /Search inputs changed/);
});
