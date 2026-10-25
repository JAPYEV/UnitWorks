import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshDb, createUser } from './helpers.js';
import { collectAudit } from '../scripts/data-audit.js';
import { captureSnapshot, verifySnapshot } from '../scripts/data-snapshot.js';
import { migrate } from '../scripts/migrate.js';
import { seed } from '../scripts/seed.js';

test('audit runs in a read-only snapshot and distinguishes missing specs from invalid data', async () => {
  const db = await freshDb();
  try {
    await db.query('begin isolation level repeatable read read only');
    await assert.rejects(db.query('delete from inventory_items'), e => e.code === '25006');
    await db.query('rollback');
    await db.query('begin isolation level repeatable read read only');
    const report = await collectAudit(db);
    for (const name of ['ledger_totals','ledger_running_balances','invalid_specs','duplicate_names','duplicate_skus',
      'invalid_inventory','build_totals','optimization_consistency','restock_totals','restock_lines','profile_auth_consistency']) {
      assert.deepEqual(report.checks[name], [], name);
    }
    assert.ok(report.checks.missing_specs.some(r => r.id === 'gpu-rtx3050-6g' && r.spec_key === 'length'));
    assert.ok(report.checks.orphans.every(r => r.orphans === 0));
    assert.deepEqual(report.errors, { supabase_migration_history: '42P01' });
    await db.query('rollback');
  } finally { await db.close(); }
});

test('snapshot restores archived stock, exact ledger identities, profiles and attribution without touching its source', async () => {
  const db = await freshDb();
  try {
    const user = await createUser(db, { email: 'snapshot@unitworks.test', role: 'admin' });
    await db.withActor({ id: user.id, name: 'Snapshot Admin' }, tx => tx.query("select archive_inventory_item('cpu-r5-5600')"));
    await db.query('begin isolation level repeatable read read only');
    const snapshot = await captureSnapshot(db);
    await db.query('rollback');
    const verification = await verifySnapshot(snapshot);
    assert.equal(verification.status, 'verified');
    assert.equal(verification.ledgerMismatches, 0);
    assert.equal(verification.tableCounts.user_profiles, 1);
    assert.equal((await db.query("select stock,archived_by from inventory_items where id='cpu-r5-5600'")).rows[0].archived_by, user.id);
    const corrupt = structuredClone(snapshot);
    corrupt.tables.inventory_movements.rows.pop();
    await assert.rejects(verifySnapshot(corrupt), /SNAPSHOT_CHECKSUM_MISMATCH/);
    const wrongMigrations = structuredClone(snapshot);
    wrongMigrations.migrations[0].sha256 = 'different';
    await assert.rejects(verifySnapshot(wrongMigrations), /MIGRATION_MANIFEST_MISMATCH/);
  } finally { await db.close(); }
});

test('migration and seed reruns preserve data', async () => {
  const db = await freshDb();
  try {
    await db.query('begin');
    const before = await captureSnapshot(db);
    await db.query('rollback');
    await migrate(db, { log: () => {} });
    assert.equal(await seed(db, { log: () => {} }), false);
    await db.query('begin');
    const after = await captureSnapshot(db);
    await db.query('rollback');
    assert.deepEqual(after.tables, before.tables);
  } finally { await db.close(); }
});

test('proposed hardening rejects inconsistent totals, permits atomic saves/deletes and closes future grants', async () => {
  const db = await freshDb();
  try {
    // Supabase-like roles and vulnerable defaults in this isolated sandbox only.
    await db.exec(`create role anon; create role authenticated;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    // The review script targets the production owner; use this sandbox's owner.
    const role = (await db.query('select current_user as name')).rows[0].name.replaceAll('"','""');
    const sql = readFileSync(new URL('../../docs/phase2/proposed-hardening.sql', import.meta.url),'utf8')
      .replaceAll('for role postgres', `for role "${role}"`);
    await db.exec(sql);
    await assert.rejects(db.query(`select save_pc_build($1::jsonb)`, [JSON.stringify({
      name: 'Invalid sum', totalPrice: 100, status: 'incomplete', components: []
    })]), e => e.code === '23514');
    await assert.rejects(db.query(`select save_restock_plan($1::jsonb)`, [JSON.stringify({
      budget: 100, coverDays: 7, totalCost: 100, remaining: 0, items: []
    })]), e => e.code === '23514');
    const payload = JSON.stringify({ name:'Valid sum',totalPrice:6450,status:'incomplete',
      components:[{category:'cpu',itemId:'cpu-r5-5600',unitPrice:6450}] });
    const id = (await db.query('select save_pc_build($1::jsonb) as id',[payload])).rows[0].id;
    await assert.rejects(db.query('update pc_build_components set unit_price=1 where build_id=$1',[id]),e=>e.code==='23514');
    await db.query('delete from pc_builds where id=$1',[id]);
    const planPayload = JSON.stringify({ budget:200,coverDays:7,totalCost:200,remaining:0,
      items:[{itemId:'psu-cx650',rank:1,urgency:90,decision:'selected',recommendedQty:2,
        orderQty:2,unitCost:100,orderCost:200,reason:'test'}] });
    const planId = (await db.query('select save_restock_plan($1::jsonb) as id',[planPayload])).rows[0].id;
    await db.query('select receive_restock_plan($1::uuid)',[planId]);
    assert.equal((await db.query('select status from restock_plans where id=$1',[planId])).rows[0].status,'received');
    assert.deepEqual((await db.query('select id from inventory_stock_audit where difference<>0')).rows,[]);
    await db.exec(`create table phase2_grant_probe(id int); create function phase2_grant_probe() returns int language sql as 'select 1';`);
    const access = (await db.query(`select has_table_privilege('anon','phase2_grant_probe','SELECT') as table_access,
      has_function_privilege('authenticated','phase2_grant_probe()','EXECUTE') as function_access`)).rows[0];
    assert.deepEqual(access, { table_access:false,function_access:false });
  } finally { await db.close(); }
});
