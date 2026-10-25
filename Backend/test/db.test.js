// Database-level checks: constraints, guard triggers, atomic functions, RLS and indexes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.js';

let db;
before(async () => { db = await freshDb(); });
after(async () => { await db.close(); });

const rejects = async (sql, params, pattern) => {
  await assert.rejects(db.query(sql, params), err => (pattern instanceof RegExp ? pattern.test(err.message) || pattern.test(err.code) : err.code === pattern));
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

test('seeded stock equals the movement ledger for every item', async () => {
  assert.deepEqual((await db.query('select * from inventory_stock_audit where difference <> 0')).rows, []);
});

test('stock cannot be written directly, only through adjust_stock()', async () => {
  await rejects("update inventory_items set stock = 99 where id = 'cpu-r5-5600'", [], 'UW422');
  await rejects(`insert into inventory_items (id, sku, category_key, brand, name, price, unit_cost, stock, lead_time_days)
                 values ('cpu-x-1', 'CPU-X-1', 'cpu', 'X', 'Direct Insert CPU', 100, 50, 7, 1)`, [], 'UW422');
});

test('movement ledger is append-only', async () => {
  await rejects('update inventory_movements set quantity = 5 where id = 1', [], 'UW422');
  await rejects('delete from inventory_movements where id = 1', [], 'UW422');
});

test('check constraints reject invalid values', async () => {
  await rejects("select create_inventory_item($1::jsonb)", [JSON.stringify({ id: 'ram-neg-1', category: 'ram', brand: 'B', name: 'Negative Price', price: -1, cost: 1, minStock: 0, dailySales: 0, leadTime: 1, moq: 1 })], '23514');
  await rejects("select create_inventory_item($1::jsonb)", [JSON.stringify({ id: 'ram-cost-1', category: 'ram', brand: 'B', name: 'Cost Above Price', price: 10, cost: 20, minStock: 0, dailySales: 0, leadTime: 1, moq: 1 })], '23514');
  await rejects("select adjust_stock('cpu-r5-5600', 3, 'Sale')", [], '23514'); // a sale must reduce stock
  await rejects("select adjust_stock('cpu-r5-5600', 0, 'Adjustment')", [], 'UW422');
});

test('spec values are validated against their definitions', async () => {
  await rejects("insert into component_specs values ('cpu-r5-5600', 'cpu', 'socket', 'AM9')", [], 'UW422');
  await rejects("insert into component_specs values ('ram-fury-16-d4', 'ram', 'warp', '1')", [], 'UW422');
  await rejects("update component_specs set value = 'lots' where item_id = 'ram-fury-16-d4' and spec_key = 'capacity'", [], 'UW422');
  // spec category must match the item's category (composite foreign key)
  await rejects("insert into component_specs values ('cpu-r5-5600', 'gpu', 'vram', '8')", [], '23503');
});

test('insufficient stock leaves stock and ledger untouched', async () => {
  const before = await one("select stock, (select count(*)::int from inventory_movements where item_id = 'cpu-i7-14700k') as n from inventory_items where id = 'cpu-i7-14700k'");
  await rejects("select adjust_stock('cpu-i7-14700k', -50, 'Sale')", [], 'UW409');
  assert.deepEqual(await one("select stock, (select count(*)::int from inventory_movements where item_id = 'cpu-i7-14700k') as n from inventory_items where id = 'cpu-i7-14700k'"), before);
});

test('multi-line receipt is all-or-nothing', async () => {
  const before = await one("select stock from inventory_items where id = 'psu-cx650'");
  await rejects("select receive_items($1::jsonb, 'test')", [JSON.stringify([{ id: 'psu-cx650', qty: 5 }, { id: 'missing-item', qty: 1 }])], 'UW404');
  assert.equal((await one("select stock from inventory_items where id = 'psu-cx650'")).stock, before.stock);
  await rejects("select receive_items($1::jsonb, 'test')", [JSON.stringify([{ id: 'psu-cx650', qty: 1 }, { id: 'psu-cx650', qty: 1 }])], 'UW422');
});

test('receiving a plan rolls back entirely if one line fails', async () => {
  const id = (await one(`select save_restock_plan($1::jsonb) as id`, [JSON.stringify({
    budget: 100000, coverDays: 7, totalCost: 20000, remaining: 80000, items: [
      { itemId: 'ssd-nv2-1t', rank: 1, urgency: 90, decision: 'selected', recommendedQty: 4, orderQty: 4, unitCost: 2580, orderCost: 10320, reason: 'test' },
      { itemId: 'cool-ak400', rank: 2, urgency: 80, decision: 'partial', recommendedQty: 10, orderQty: 7, unitCost: 1350, orderCost: 9450, reason: 'test' }
    ]
  })])).id;
  await db.query("select archive_inventory_item('cool-ak400')");
  const before = await one("select stock from inventory_items where id = 'ssd-nv2-1t'");
  await rejects('select receive_restock_plan($1::uuid)', [id], 'UW404');
  assert.equal((await one("select stock from inventory_items where id = 'ssd-nv2-1t'")).stock, before.stock);
  assert.equal((await one('select status from restock_plans where id = $1', [id])).status, 'draft');
});

test('restock plan totals and decisions are constrained', async () => {
  await rejects('select save_restock_plan($1::jsonb)', [JSON.stringify({ budget: 1000, coverDays: 7, totalCost: 600, remaining: 600, items: [] })], '23514');
  await rejects('select save_restock_plan($1::jsonb)', [JSON.stringify({ budget: 1000, coverDays: 7, totalCost: 0, remaining: 1000,
    items: [{ itemId: 'ssd-nv2-1t', rank: 1, urgency: 50, decision: 'skipped', recommendedQty: 3, orderQty: 3, unitCost: 100, orderCost: 300, reason: 'x' }] })], '23514');
});

test('build components must match their category; integrated graphics only as GPU', async () => {
  const build = c => JSON.stringify({ name: 'x', totalPrice: 0, status: 'incomplete', components: [c] });
  await rejects('select save_pc_build($1::jsonb)', [build({ category: 'gpu', itemId: 'cpu-r5-5600', unitPrice: 1 })], '23503');
  await rejects('select save_pc_build($1::jsonb)', [build({ category: 'cpu', itemId: null, integrated: true, unitPrice: 0 })], '23514');
});

test('row level security is enabled on every application table', async () => {
  const { rows } = await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(rows, []);
});

test('frequently queried columns are indexed', async () => {
  const names = (await db.query("select indexname from pg_indexes where schemaname = 'public'")).rows.map(r => r.indexname);
  for (const idx of ['inventory_items_active_name_uq', 'inventory_items_category_idx', 'inventory_movements_item_idx', 'inventory_movements_created_idx', 'pc_builds_created_idx', 'restock_plans_created_idx']) {
    assert.ok(names.includes(idx), `missing index ${idx}`);
  }
});

test('archived names can be reused; active names stay unique', async () => {
  const item = n => JSON.stringify({ id: `ram-reuse-${n}`, category: 'ram', brand: 'B', name: 'Reusable Name Kit', price: 10, cost: 5, minStock: 0, dailySales: 0, leadTime: 1, moq: 1 });
  await db.query('select create_inventory_item($1::jsonb)', [item(1)]);
  await rejects('select create_inventory_item($1::jsonb)', [item(2)], '23505');
  await db.query("select archive_inventory_item('ram-reuse-1')");
  await db.query('select create_inventory_item($1::jsonb)', [item(2)]);
});
