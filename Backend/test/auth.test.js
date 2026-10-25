// Authentication and authorization: token verification, profile/role checks, the permission map on
// every route, attribution of writes, and that roles cannot be changed through the API.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair } from 'jose';
import { startApi, signToken, createUser, freshDb } from './helpers.js';
import { PERMISSIONS, permissionsFor } from '../../shared/permissions.js';
import { runUsersCommand } from '../scripts/users.js';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

const item = name => ({ name, brand: 'Auth Test', category: 'ram', price: 1000, cost: 800, stock: 4, minStock: 1, dailySales: 0, leadTime: 7, moq: 1 });

describe('authentication', () => {
  test('health stays public and does not reveal internals', async () => {
    const r = await api.get('/health', null);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body.data).sort(), ['database', 'status']);
  });

  test('every protected route rejects requests without a token (401)', async () => {
    const routes = [
      ['GET', '/me'], ['GET', '/catalog/categories'], ['GET', '/inventory'], ['POST', '/inventory'], ['GET', '/inventory/movements'],
      ['GET', '/inventory/cpu-r5-5600'], ['PATCH', '/inventory/cpu-r5-5600'], ['DELETE', '/inventory/cpu-r5-5600'],
      ['GET', '/inventory/cpu-r5-5600/movements'], ['POST', '/inventory/cpu-r5-5600/adjustments'], ['GET', '/components'], ['GET', '/components/cpu-r5-5600'],
      ['POST', '/builds/validate'], ['POST', '/builds/search'], ['GET', '/builds'], ['POST', '/builds'], ['GET', '/builds/x'], ['DELETE', '/builds/x'],
      ['POST', '/optimizer/recommendations'], ['GET', '/optimizer/runs'], ['POST', '/optimizer/runs'],
      ['POST', '/restock/recommendations'], ['GET', '/restock/plans'], ['POST', '/restock/plans'], ['GET', '/restock/plans/x'], ['POST', '/restock/plans/x/receive'],
      ['GET', '/dashboard'], ['GET', '/no-such-route']
    ];
    for (const [m, p] of routes) {
      const r = await api.call(m, p, m === 'GET' || m === 'DELETE' ? undefined : {}, null);
      assert.equal(r.status, 401, `${m} ${p} returned ${r.status}`);
      assert.equal(r.body.error.code, 'unauthenticated');
      assert.equal(r.body.data, undefined);
    }
  });

  test('malformed Authorization headers are rejected', async () => {
    for (const token of ['', 'not-a-jwt', 'a.b.c', 'Basic abc']) {
      const r = await api.get('/inventory', { token });
      assert.equal(r.status, 401, `token "${token}"`);
    }
  });

  test('expired tokens are rejected with session_expired', async () => {
    const t = await signToken(api.keys.privateKey, api.users.admin, { iat: 1000, exp: 2000 });
    const r = await api.get('/inventory', { token: t });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'session_expired');
  });

  test('tokens signed with another key, for another issuer or audience are rejected', async () => {
    const { privateKey: otherKey } = await generateKeyPair('ES256');
    const forged = await signToken(api.keys.privateKey, api.users.admin, { key: otherKey });
    const wrongIss = await signToken(api.keys.privateKey, api.users.admin, { issuer: 'https://evil.example/auth/v1' });
    const wrongAud = await signToken(api.keys.privateKey, api.users.admin, { audience: 'anon' });
    for (const t of [forged, wrongIss, wrongAud]) {
      const r = await api.get('/inventory', { token: t });
      assert.equal(r.status, 401);
      assert.equal(r.body.error.code, 'invalid_token');
    }
  });

  test('a tampered payload invalidates the signature', async () => {
    const [h, p, s] = api.tokens.staff.split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    claims.sub = api.users.admin.id;
    claims.user_metadata = { role: 'admin' };
    const tampered = [h, Buffer.from(JSON.stringify(claims)).toString('base64url'), s].join('.');
    assert.equal((await api.get('/inventory', { token: tampered })).status, 401);
  });

  test('role claims inside a validly signed token are ignored: the database role wins', async () => {
    const t = await signToken(api.keys.privateKey, api.users.staff, { claims: { role: 'service_role', app_metadata: { role: 'admin' }, user_metadata: { role: 'admin' } } });
    const me = await api.get('/me', { token: t });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.role, 'staff');
    assert.equal((await api.post('/inventory', item('Claim Escalation Kit'), { token: t })).status, 403);
  });

  test('signed-in users without a role, unknown users and disabled users get 403', async () => {
    const pending = await api.get('/inventory', 'pending');
    assert.equal(pending.status, 403);
    assert.equal(pending.body.error.code, 'no_access');
    const ghost = await signToken(api.keys.privateKey, { id: '11111111-2222-4333-8444-555555555555', email: 'ghost@x.test' });
    assert.equal((await api.get('/inventory', { token: ghost })).body.error.code, 'no_access');
    const disabled = await api.get('/inventory', 'disabled');
    assert.equal(disabled.status, 403);
    assert.equal(disabled.body.error.code, 'account_disabled');
  });

  test('disabling an account blocks it immediately, even with an unexpired token', async () => {
    const u = await createUser(api.db, { email: 'soon-disabled@unitworks.test', role: 'staff' });
    const t = await signToken(api.keys.privateKey, u);
    assert.equal((await api.get('/inventory', { token: t })).status, 200);
    await api.db.query('update user_profiles set is_active = false where id = $1', [u.id]);
    assert.equal((await api.get('/inventory', { token: t })).status, 403);
  });

  test('GET /me returns identity, database role and derived permissions', async () => {
    const r = await api.get('/me', 'staff');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data, { id: api.users.staff.id, email: 'staff@unitworks.test', name: 'Test Staff', role: 'staff', permissions: permissionsFor('staff') });
  });
});

describe('authorization (staff vs admin)', () => {
  test('staff can read and run algorithms', async () => {
    for (const [m, p, b] of [
      ['GET', '/inventory'], ['GET', '/inventory/cpu-r5-5600'], ['GET', '/catalog/categories'], ['GET', '/components?category=gpu'],
      ['POST', '/builds/validate', { selection: { cpu: 'cpu-r5-5600' } }], ['POST', '/builds/search', { locked: { cpu: 'cpu-r5-5600' }, budget: 50000 }],
      ['GET', '/builds'], ['POST', '/optimizer/recommendations', { budget: 60000 }], ['GET', '/optimizer/runs'],
      ['POST', '/restock/recommendations', { budget: 200000 }], ['GET', '/restock/plans'], ['GET', '/dashboard']
    ]) {
      const r = await api.call(m, p, b, 'staff');
      assert.equal(r.status, 200, `${m} ${p} → ${r.status} ${r.body?.error?.message || ''}`);
    }
  });

  test('staff cannot modify inventory, adjust stock, view movements, save or receive (403)', async () => {
    for (const [m, p, b] of [
      ['POST', '/inventory', item('Staff Attempt Kit')], ['PATCH', '/inventory/cpu-r5-5600', { price: 1 }], ['DELETE', '/inventory/cpu-r5-5600'],
      ['POST', '/inventory/cpu-r5-5600/adjustments', { mode: 'remove', quantity: 1, reason: 'Sale' }],
      ['GET', '/inventory/movements'], ['GET', '/inventory/cpu-r5-5600/movements'],
      ['POST', '/builds', { selection: { cpu: 'cpu-r5-5600' } }], ['DELETE', '/builds/00000000-0000-4000-8000-000000000000'],
      ['POST', '/optimizer/runs', { budget: 60000 }], ['POST', '/restock/plans', { budget: 200000 }],
      ['POST', '/restock/plans/00000000-0000-4000-8000-000000000000/receive']
    ]) {
      const r = await api.call(m, p, b, 'staff');
      assert.equal(r.status, 403, `${m} ${p} → ${r.status}`);
      assert.equal(r.body.error.code, 'forbidden');
    }
    // nothing changed
    const p = (await api.get('/inventory/cpu-r5-5600')).body.data;
    assert.ok(p.price > 1 && !p.archived);
    assert.equal((await api.get('/inventory?q=Staff%20Attempt')).body.meta.total, 0);
  });

  test('staff dashboard omits the admin-only movement history', async () => {
    assert.equal((await api.get('/dashboard', 'staff')).body.data.recentMovements, null);
    assert.equal((await api.get('/dashboard', 'admin')).body.data.recentMovements.length, 8);
  });

  test('every route maps to a permission that exists in the central map', () => {
    for (const role of ['admin', 'staff']) assert.ok(permissionsFor(role).every(p => PERMISSIONS[p]));
    assert.deepEqual(permissionsFor(null), []);
    assert.deepEqual(permissionsFor('superuser'), []);
  });
});

describe('attribution and role integrity', () => {
  test('writes are attributed to the authenticated user in the database', async () => {
    const created = (await api.post('/inventory', item('Attribution Test Kit'), 'admin')).body.data;
    await api.post(`/inventory/${created.id}/adjustments`, { mode: 'receive', quantity: 2, reason: 'Supplier delivery' }, 'admin');
    const mv = await api.db.query('select performed_by, performed_by_user_id from inventory_movements where item_id = $1 order by id', [created.id]);
    assert.equal(mv.rows.length, 2);
    for (const m of mv.rows) { assert.equal(m.performed_by_user_id, api.users.admin.id); assert.equal(m.performed_by, 'Test Admin'); }

    const build = (await api.post('/builds', { selection: { cpu: 'cpu-r5-5600' } }, 'admin')).body.data;
    assert.equal(build.createdBy, api.users.admin.id);
    const run = (await api.post('/optimizer/runs', { budget: 60000 }, 'admin')).body.data;
    assert.equal((await api.db.query('select created_by from optimization_runs where id = $1', [run.id])).rows[0].created_by, api.users.admin.id);
    const plan = (await api.post('/restock/plans', { budget: 150000 }, 'admin')).body.data;
    await api.post(`/restock/plans/${plan.id}/receive`, {}, 'admin');
    const pr = (await api.db.query('select created_by, received_by from restock_plans where id = $1', [plan.id])).rows[0];
    assert.deepEqual(pr, { created_by: api.users.admin.id, received_by: api.users.admin.id });
    await api.del(`/inventory/${created.id}`, 'admin');
    assert.equal((await api.db.query('select archived_by from inventory_items where id = $1', [created.id])).rows[0].archived_by, api.users.admin.id);
  });

  test('the actor setting does not leak into unrelated work', async () => {
    const r = await api.db.query("select current_setting('unitworks.actor_id', true) as v");
    assert.ok(!r.rows[0].v);
  });

  test('request bodies cannot set roles, attribution or users', async () => {
    const r = await api.patch('/inventory/cpu-r5-5600', { role: 'admin', performed_by_user_id: api.users.staff.id, created_by: api.users.staff.id }, 'admin');
    assert.equal(r.status, 200); // unknown fields are ignored
    const created = (await api.post('/inventory', { ...item('Body Injection Kit'), role: 'admin', performedBy: 'someone else', userId: api.users.staff.id }, 'admin')).body.data;
    const mv = await api.db.query('select performed_by, performed_by_user_id from inventory_movements where item_id = $1', [created.id]);
    assert.equal(mv.rows[0].performed_by_user_id, api.users.admin.id);
    assert.equal((await api.get('/me', 'staff')).body.data.role, 'staff');
  });

  test('database errors and stack traces are not exposed to clients', async () => {
    const r = await api.post('/inventory', { ...item('Ab'), price: 'DROP TABLE x' }, 'admin');
    assert.equal(r.status, 422);
    const text = JSON.stringify(r.body);
    assert.ok(!/postgres|select |at .*\.js|stack/i.test(text));
  });
});

describe('profile provisioning', () => {
  test('new auth accounts get a profile with no role (no access by default)', async () => {
    const u = await createUser(api.db, { email: 'new-signup@unitworks.test', name: 'New Person' });
    const p = (await api.db.query('select role, is_active, email, full_name from user_profiles where id = $1', [u.id])).rows[0];
    assert.deepEqual(p, { role: null, is_active: true, email: 'new-signup@unitworks.test', full_name: 'New Person' });
  });

  test('roles are constrained to admin and staff', async () => {
    await assert.rejects(api.db.query("update user_profiles set role = 'owner' where id = $1", [api.users.staff.id]), e => e.code === '23514');
  });

  test('deleting an auth account removes its profile; movement history keeps the user id', async () => {
    const db = await freshDb();
    const u = await createUser(db, { email: 'leaver@unitworks.test', role: 'admin', name: 'Leaver' });
    await db.withActor({ id: u.id, name: 'Leaver' }, tx => tx.query("select adjust_stock('psu-cx650', 1, 'Received', 'test', null, 'Leaver')"));
    await db.query('delete from auth.users where id = $1', [u.id]);
    assert.equal((await db.query('select count(*)::int n from user_profiles where id = $1', [u.id])).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from inventory_movements where performed_by_user_id = $1', [u.id])).rows[0].n, 1);
    await db.close();
  });

  test('users script grants, revokes, disables and lists roles', async () => {
    const db = await freshDb({ withSeed: false });
    const u = await createUser(db, { email: 'Owner@UnitWorks.test' });
    const quiet = () => {};
    await assert.rejects(runUsersCommand(db, ['grant', '--email', 'owner@unitworks.test', '--role', 'root'], quiet), /--role must be one of/);
    await assert.rejects(runUsersCommand(db, ['grant', '--email', 'nobody@unitworks.test', '--role', 'admin'], quiet), /No Supabase account/);
    assert.equal((await runUsersCommand(db, ['grant', '--email', 'owner@unitworks.test', '--role', 'admin', '--name', 'Store Owner'], quiet)).role, 'admin');
    assert.equal((await runUsersCommand(db, ['disable', '--email', 'owner@unitworks.test'], quiet)).is_active, false);
    assert.equal((await runUsersCommand(db, ['grant', '--email', 'owner@unitworks.test', '--role', 'staff'], quiet)).is_active, false); // stays disabled
    assert.equal((await runUsersCommand(db, ['enable', '--email', 'owner@unitworks.test'], quiet)).is_active, true);
    assert.equal((await runUsersCommand(db, ['revoke', '--email', 'owner@unitworks.test'], quiet)).role, null);
    const rows = await runUsersCommand(db, ['list'], quiet);
    assert.equal(rows.length, 1);
    assert.equal((await db.query('select full_name from user_profiles where id = $1', [u.id])).rows[0].full_name, 'Store Owner');
    await db.close();
  });
});
