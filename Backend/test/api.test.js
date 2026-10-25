import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.js';
import { loadConfig } from '../src/config.js';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

const newItem = (over = {}) => ({
  name: 'Test Vendor 32GB DDR5-6400 Kit', brand: 'Test Vendor', category: 'ram', price: 7000, cost: 5600,
  stock: 5, minStock: 2, dailySales: 0.4, leadTime: 7, moq: 2, specs: { type: 'DDR5', capacity: 32, speed: 6400 }, ...over
});

describe('health and errors', () => {
  test('health reports the database as up', async () => {
    const r = await api.get('/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.database, 'up');
  });
  test('unknown route returns 404 JSON', async () => {
    const r = await api.get('/nope');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'not_found');
  });
  test('malformed JSON body returns 400', async () => {
    const r = await api.call('POST', '/inventory', '{"name": ');
    assert.equal(r.status, 400);
  });
  test('config requires DATABASE_URL for postgres and SUPABASE_URL for sign-in', () => {
    const url = 'https://abc.supabase.co';
    assert.throws(() => loadConfig({ dbDriver: 'postgres', databaseUrl: '', supabaseUrl: url }), /DATABASE_URL is required/);
    assert.throws(() => loadConfig({ dbDriver: 'mongo', supabaseUrl: url }), /DB_DRIVER/);
    assert.throws(() => loadConfig({ dbDriver: 'pglite', supabaseUrl: '' }), /SUPABASE_URL is required/);
    assert.throws(() => loadConfig({ dbDriver: 'pglite', supabaseUrl: 'http://abc.supabase.co' }), /https/);
    assert.doesNotThrow(() => loadConfig({ dbDriver: 'pglite', supabaseUrl: url }));
    assert.doesNotThrow(() => loadConfig({ dbDriver: 'pglite', skipAuthConfig: true }));
  });
});

describe('inventory', () => {
  test('lists all active items with status counts', async () => {
    const r = await api.get('/inventory');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.length, 44);
    const c = r.body.meta.counts;
    assert.equal(c.all, 44);
    assert.equal(c.in + c.low + c.out, 44);
    assert.equal(typeof r.body.data[0].price, 'number');
  });
  test('search, filter, sort and paginate on the server', async () => {
    const r = await api.get('/inventory?q=ryzen&category=cpu&sort=price&dir=desc&page=1&pageSize=2');
    assert.equal(r.status, 200);
    assert.equal(r.body.meta.total, 4);
    assert.equal(r.body.meta.pages, 2);
    assert.equal(r.body.data.length, 2);
    assert.ok(r.body.data[0].price >= r.body.data[1].price);
    const out = await api.get('/inventory?status=out');
    assert.ok(out.body.data.every(p => p.stock <= 0));
    const high = await api.get('/inventory?demand=high');
    assert.ok(high.body.data.every(p => p.dailySales >= 0.5));
  });
  test('search treats % and _ literally', async () => {
    const r = await api.get('/inventory?q=%25');
    assert.equal(r.body.meta.total, 0);
  });
  test('rejects invalid filter values', async () => {
    const r = await api.get('/inventory?status=broken&pageSize=1000');
    assert.equal(r.status, 422);
    assert.ok(r.body.error.details.status && r.body.error.details.pageSize);
  });
  test('get one item, and 404 for a missing one', async () => {
    assert.equal((await api.get('/inventory/cpu-r5-5600')).body.data.specs.socket, 'AM4');
    assert.equal((await api.get('/inventory/does-not-exist')).status, 404);
  });
  test('create validates fields and specs', async () => {
    const r = await api.post('/inventory', newItem({ name: 'abc', price: -1, cost: 0, leadTime: 0, specs: { type: 'DDR9', speed: 'fast', bogus: 1 } }));
    assert.equal(r.status, 422);
    const d = r.body.error.details;
    assert.ok(d.name && d.price && d.cost && d.leadTime);
    const r2 = await api.post('/inventory', newItem({ specs: { type: 'DDR9', speed: 'fast', bogus: 1 } }));
    assert.equal(r2.status, 422);
    assert.ok(r2.body.error.details['specs.type'] && r2.body.error.details['specs.speed'] && r2.body.error.details['specs.bogus']);
    const r3 = await api.post('/inventory', newItem({ cost: 9000 }));
    assert.match(r3.body.error.details.cost, /higher than the selling price/);
  });
  test('create persists the item, its specs and an opening movement', async () => {
    const r = await api.post('/inventory', newItem());
    assert.equal(r.status, 201);
    const p = r.body.data;
    assert.equal(p.stock, 5);
    assert.deepEqual(p.specs, { type: 'DDR5', capacity: 32, speed: 6400 });
    const mv = await api.get(`/inventory/${p.id}/movements`);
    assert.equal(mv.body.data.length, 1);
    assert.equal(mv.body.data[0].qty, 5);
    assert.equal(mv.body.data[0].type, 'Received');
    assert.equal(mv.body.data[0].user, 'Test Admin');
    assert.equal(mv.body.data[0].userId, api.users.admin.id);
    const dup = await api.post('/inventory', newItem({ name: newItem().name.toUpperCase() }));
    assert.equal(dup.status, 409);
    assert.match(dup.body.error.message, /already exists/);
  });
  test('update changes details but never stock or category', async () => {
    const r = await api.patch('/inventory/cpu-r5-5600', { price: 6500, specs: { socket: 'AM4', cores: '6 / 12', maxPower: 65, igpu: 'No' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.price, 6500);
    assert.equal(r.body.data.specs.maxPower, 65);
    assert.equal((await api.patch('/inventory/cpu-r5-5600', { stock: 99 })).status, 422);
    assert.equal((await api.patch('/inventory/cpu-r5-5600', { category: 'gpu' })).status, 422);
    assert.equal((await api.patch('/inventory/missing-item', { price: 1 })).status, 404);
  });
  test('stock adjustments are recorded and keep the ledger consistent', async () => {
    const before = (await api.get('/inventory/psu-cx650')).body.data.stock;
    const add = await api.post('/inventory/psu-cx650/adjustments', { mode: 'receive', quantity: 4, reason: 'Supplier delivery' });
    assert.equal(add.status, 201);
    assert.equal(add.body.data.item.stock, before + 4);
    assert.equal(add.body.data.movement.type, 'Received');
    const sale = await api.post('/inventory/psu-cx650/adjustments', { mode: 'remove', quantity: 1, reason: 'Sale' });
    assert.equal(sale.body.data.movement.type, 'Sale');
    assert.equal(sale.body.data.movement.qty, -1);
    const count = await api.post('/inventory/psu-cx650/adjustments', { mode: 'set', quantity: 2, reason: 'Cycle count' });
    assert.equal(count.body.data.item.stock, 2);
    assert.equal(count.body.data.movement.type, 'Adjustment');
    const same = await api.post('/inventory/psu-cx650/adjustments', { mode: 'set', quantity: 2, reason: 'Cycle count' });
    assert.equal(same.status, 200);
    assert.equal(same.body.data.changed, false);
    const { rows } = await api.db.query('select * from inventory_stock_audit where difference <> 0');
    assert.deepEqual(rows, []);
  });
  test('removing more than available fails without changing anything', async () => {
    const before = await api.db.query("select stock, (select count(*) from inventory_movements where item_id = 'psu-gx750')::int as n from inventory_items where id = 'psu-gx750'");
    const r = await api.post('/inventory/psu-gx750/adjustments', { mode: 'remove', quantity: 999, reason: 'Sale' });
    assert.equal(r.status, 409);
    assert.match(r.body.error.message, /Only 2 units/);
    const afterRow = await api.db.query("select stock, (select count(*) from inventory_movements where item_id = 'psu-gx750')::int as n from inventory_items where id = 'psu-gx750'");
    assert.deepEqual(afterRow.rows, before.rows);
  });
  test('adjustment input validation', async () => {
    assert.equal((await api.post('/inventory/psu-cx650/adjustments', { mode: 'receive', quantity: 0, reason: 'Supplier delivery' })).status, 422);
    assert.equal((await api.post('/inventory/psu-cx650/adjustments', { mode: 'remove', quantity: 1, reason: 'Supplier delivery' })).status, 422);
    assert.equal((await api.post('/inventory/psu-cx650/adjustments', { mode: 'receive', quantity: 1.5, reason: 'Supplier delivery' })).status, 422);
    assert.equal((await api.post('/inventory/missing/adjustments', { mode: 'receive', quantity: 1, reason: 'Supplier delivery' })).status, 404);
  });
  test('archive hides the item but keeps its history', async () => {
    const created = (await api.post('/inventory', newItem({ name: 'Archive Me Test Kit 16GB', stock: 1 }))).body.data;
    assert.equal((await api.del(`/inventory/${created.id}`)).status, 204);
    assert.equal((await api.get(`/inventory/${created.id}`)).status, 404);
    assert.equal((await api.del(`/inventory/${created.id}`)).status, 404);
    const mv = await api.get('/inventory/movements?limit=200');
    assert.ok(mv.body.data.some(m => m.productId === created.id && m.productName === created.name));
  });
  test('categories and component catalog', async () => {
    const cats = await api.get('/catalog/categories');
    assert.equal(cats.body.data.length, 8);
    assert.equal(cats.body.data.find(c => c.key === 'gpu').specFields.length, 6);
    const gpus = await api.get('/components?category=gpu');
    assert.ok(gpus.body.data.some(p => p.id === 'igpu'));
    const one = await api.get('/components/gpu-rtx3050-6g');
    assert.equal(one.body.data.specRows.find(s => s.key === 'length').value, null);
  });
});

describe('builds', () => {
  test('validate reports conflicts from real compatibility rules', async () => {
    const r = await api.post('/builds/validate', { selection: { cpu: 'cpu-r5-7600', motherboard: 'mb-b550m-vdh' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.overall, 'incompatible');
    assert.equal(r.body.data.fails[0].id, 'socket');
  });
  test('validate rejects unknown parts and wrong categories', async () => {
    assert.equal((await api.post('/builds/validate', { selection: { cpu: 'gpu-rx7600' } })).status, 422);
    assert.equal((await api.post('/builds/validate', { selection: { cpu: 'nope' } })).status, 422);
    assert.equal((await api.post('/builds/validate', { selection: { wheels: 'x' } })).status, 422);
    assert.equal((await api.post('/builds/validate', { selection: { cpu: 'igpu' } })).status, 422);
  });
  test('backtracking search returns solutions that respect locks and budget', async () => {
    const r = await api.post('/builds/search', { locked: { cpu: 'cpu-r5-5600' }, budget: 50000 });
    assert.equal(r.status, 200);
    const s = r.body.data;
    assert.ok(s.solutions.length > 0);
    assert.ok(s.solutions.every(x => x.sel.cpu === 'cpu-r5-5600' && x.total <= 50000));
    assert.ok(s.stats.explored > 0 && typeof s.durationMs === 'number');
  });
  test('impossible budget yields no solutions', async () => {
    const r = await api.post('/builds/search', { budget: 1000 });
    assert.equal(r.body.data.solutions.length, 0);
    assert.ok(r.body.data.stats.prunedBudget > 0);
  });
  test('save, list, get and delete a build', async () => {
    const sel = { cpu: 'cpu-r5-5600g', gpu: 'igpu' };
    const r = await api.post('/builds', { name: 'iGPU test build', selection: sel, budget: 40000 });
    assert.equal(r.status, 201);
    const b = r.body.data;
    assert.equal(b.status, 'incomplete');
    assert.equal(b.totalPrice, 7450);
    assert.ok(b.components.some(c => c.category === 'gpu' && c.integrated && c.itemId === null));
    assert.ok((await api.get('/builds')).body.data.some(x => x.id === b.id));
    assert.equal((await api.get(`/builds/${b.id}`)).body.data.name, 'iGPU test build');
    assert.equal((await api.del(`/builds/${b.id}`)).status, 204);
    assert.equal((await api.get(`/builds/${b.id}`)).status, 404);
    assert.equal((await api.get('/builds/not-a-uuid')).status, 404);
    assert.equal((await api.post('/builds', { selection: {} })).status, 422);
  });
});

describe('optimizer', () => {
  test('recommendation stays within budget and is compatible', async () => {
    const r = await api.post('/optimizer/recommendations', { budget: 70000, useCase: 'Gaming' });
    assert.equal(r.status, 200);
    const d = r.body.data;
    assert.ok(d.rec.ok);
    assert.ok(d.rec.total <= 70000);
    assert.equal(d.compatibility.overall, 'compatible');
    assert.ok(d.alts.length >= 1);
    // -Infinity DP cells are serialized as null
    assert.ok(d.rec.table.rows.flatMap(row => row.cells).every(c => c.v === null || typeof c.v === 'number'));
  });
  test('validation and infeasible budgets', async () => {
    const bad = await api.post('/optimizer/recommendations', { budget: 100, useCase: 'Mining', pri: { graphics: 9 } });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.error.details.budget && bad.body.error.details.useCase);
    const inf = await api.post('/optimizer/recommendations', { budget: 15000, minRam: 64 });
    assert.equal(inf.status, 200);
    assert.equal(inf.body.data.rec.ok, false);
  });
  test('saving a run stores the run and its build', async () => {
    const r = await api.post('/optimizer/runs', { budget: 60000, useCase: 'Programming' });
    assert.equal(r.status, 201);
    const runs = await api.get('/optimizer/runs');
    const saved = runs.body.data.find(x => x.id === r.body.data.id);
    assert.ok(saved && saved.feasible && saved.buildId);
    assert.ok(saved.stats.states > 0);
    const build = await api.get(`/builds/${saved.buildId}`);
    assert.equal(build.body.data.source, 'optimizer');
    assert.equal(build.body.data.components.length, 8);
  });
});

describe('restock', () => {
  test('recommendation ranks candidates and respects the budget', async () => {
    const r = await api.post('/restock/recommendations', { budget: 300000, coverDays: 7 });
    assert.equal(r.status, 200);
    const p = r.body.data;
    assert.ok(p.totalCost <= 300000);
    assert.equal(p.totalCost + p.remaining, 300000);
    for (let i = 1; i < p.cands.length; i++) assert.ok(p.cands[i - 1].urgency >= p.cands[i].urgency);
    assert.equal(p.cands[0].p, undefined);
  });
  test('validation', async () => {
    assert.equal((await api.post('/restock/recommendations', { budget: -5 })).status, 422);
    assert.equal((await api.post('/restock/recommendations', { budget: 1000, coverDays: 9 })).status, 422);
  });
  test('save and receive a plan exactly once', async () => {
    const saved = await api.post('/restock/plans', { budget: 200000, coverDays: 7 });
    assert.equal(saved.status, 201);
    const id = saved.body.data.id;
    const plan = (await api.get(`/restock/plans/${id}`)).body.data;
    assert.equal(plan.status, 'draft');
    const funded = plan.items.filter(i => i.orderQty > 0);
    const target = funded[0];
    const before = (await api.get(`/inventory/${target.itemId}`)).body.data.stock;
    const rec = await api.post(`/restock/plans/${id}/receive`);
    assert.equal(rec.status, 200);
    assert.equal(rec.body.data.lines, funded.length);
    assert.equal(rec.body.data.plan.status, 'received');
    assert.equal((await api.get(`/inventory/${target.itemId}`)).body.data.stock, before + target.orderQty);
    const again = await api.post(`/restock/plans/${id}/receive`);
    assert.equal(again.status, 409);
    assert.ok((await api.get('/restock/plans')).body.data.some(x => x.id === id && x.status === 'received'));
    assert.equal((await api.get('/restock/plans/00000000-0000-0000-0000-000000000000')).status, 404);
  });
});

describe('dashboard', () => {
  test('summary is computed from database records', async () => {
    const r = await api.get('/dashboard');
    assert.equal(r.status, 200);
    const d = r.body.data;
    const all = (await api.get('/inventory')).body.data;
    assert.equal(d.totals.products, all.length);
    assert.equal(d.totals.units, all.reduce((s, p) => s + p.stock, 0));
    assert.equal(d.recentMovements.length, 8);
    assert.equal(d.byCategory.length, 8);
  });
});
