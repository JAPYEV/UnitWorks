// Test harness: a fresh in-memory Postgres (PGlite) with the real migrations and demo seed, a minimal
// stand-in for Supabase's auth.users table (so the profile trigger and foreign key are exercised),
// and the real Express app. Tokens are signed with a locally generated ES256 key and verified by the
// same createTokenVerifier code used in production, just with a local key set instead of the
// project's published one.
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { createDb } from '../src/lib/db.js';
import { createApp } from '../src/app.js';
import { createTokenVerifier } from '../src/middleware/auth.js';
import { migrate } from '../scripts/migrate.js';
import { seed } from '../scripts/seed.js';

export const ISSUER = 'https://test-project.supabase.co/auth/v1';

const AUTH_STUB = `create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);`;

export async function freshDb({ withSeed = true, withAuth = true, through } = {}) {
  const db = await createDb({ dbDriver: 'pglite', pgliteDataDir: 'memory' });
  if (withAuth) await db.exec(AUTH_STUB);
  await migrate(db, { log: () => {}, through });
  if (withSeed) await seed(db, { log: () => {} });
  return db;
}

export async function makeKeys() {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

/** Signs a Supabase-style access token. `over` can change claims, expiry or the signing key. */
export async function signToken(privateKey, user, over = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: user.email, role: 'authenticated', aal: 'aal1', ...(over.claims || {}) })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(over.issuer || ISSUER)
    .setAudience(over.audience || 'authenticated')
    .setIssuedAt(over.iat ?? now)
    .setExpirationTime(over.exp ?? now + 3600)
    .sign(over.key || privateKey);
}

/** Creates an auth user (the trigger adds a role-less profile), then optionally assigns a role. */
export async function createUser(db, { email, role = null, name = null, active = true }) {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)', [id, email, JSON.stringify(name ? { full_name: name } : {})]);
  if (role || !active) await db.query('update user_profiles set role = $2, is_active = $3 where id = $1', [id, role, active]);
  return { id, email, name };
}

export async function startApi(opts) {
  const db = await freshDb(opts);
  const keys = await makeKeys();
  const app = createApp({
    db,
    config: { corsOrigins: ['http://localhost:5173'], supabaseUrl: 'https://test-project.supabase.co' },
    verifyToken: createTokenVerifier({ issuer: ISSUER, jwks: keys.jwks })
  });
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const users = {
    admin: await createUser(db, { email: 'admin@unitworks.test', role: 'admin', name: 'Test Admin' }),
    staff: await createUser(db, { email: 'staff@unitworks.test', role: 'staff', name: 'Test Staff' }),
    pending: await createUser(db, { email: 'pending@unitworks.test' }),
    disabled: await createUser(db, { email: 'disabled@unitworks.test', role: 'admin', active: false })
  };
  const tokens = {};
  for (const [k, u] of Object.entries(users)) tokens[k] = await signToken(keys.privateKey, u);

  /** as: 'admin' | 'staff' | ... | null (no Authorization header) | { token } (raw token) */
  const call = async (method, path, body, as = 'admin') => {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = as === null ? null : typeof as === 'object' ? as.token : tokens[as];
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(base + path, {
      method, headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return {
    db, call, users, tokens, keys,
    get: (p, as) => call('GET', p, undefined, as), post: (p, b, as) => call('POST', p, b ?? {}, as),
    patch: (p, b, as) => call('PATCH', p, b, as), del: (p, as) => call('DELETE', p, undefined, as),
    close: async () => { await new Promise(r => server.close(r)); await db.close(); }
  };
}
