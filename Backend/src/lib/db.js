// Database adapter with a single interface: query(text, params) → { rows }, exec(sql), close(),
// and withActor(actor, fn) for writes that must be attributed to the signed-in user.
// "postgres" connects to Supabase Postgres with node-postgres; "pglite" runs an embedded Postgres
// (explicit opt-in for local development and tests only).
import pg from 'pg';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Transaction-local settings read by current_actor_id() and the column defaults in the database.
const SET_ACTOR = "select set_config('unitworks.actor_id', $1, true), set_config('unitworks.actor_name', $2, true)";

export async function createDb(cfg) {
  if (cfg.dbDriver === 'pglite') {
    const { PGlite } = await import('@electric-sql/pglite');
    if (cfg.pgliteDataDir !== 'memory') mkdirSync(dirname(resolve(cfg.pgliteDataDir)), { recursive: true });
    const db = cfg.pgliteDataDir === 'memory' ? new PGlite() : new PGlite(cfg.pgliteDataDir);
    await db.waitReady;
    return {
      driver: 'pglite',
      query: (text, params = []) => db.query(text, params),
      exec: async sql => {
        try { return await db.exec(sql); }
        catch (e) { await db.exec('rollback').catch(() => {}); throw e; }
      },
      withActor: (actor, fn) => db.transaction(async tx => {
        await tx.query(SET_ACTOR, [actor?.id || '', actor?.name || '']);
        return fn({ query: (text, params = []) => tx.query(text, params) });
      }),
      close: () => db.close()
    };
  }
  const pool = new pg.Pool({
    connectionString: cfg.databaseUrl,
    ssl: cfg.databaseSsl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  pool.on('error', err => console.error('Postgres pool error:', err.message));
  return {
    driver: 'postgres',
    query: (text, params = []) => pool.query(text, params),
    // A multi-statement migration/seed can fail after BEGIN. Roll back on the
    // same connection before returning it to the pool; otherwise the next
    // request can inherit an aborted transaction.
    exec: async sql => {
      const client = await pool.connect();
      try { return await client.query(sql); }
      catch (e) { await client.query('rollback').catch(() => {}); throw e; }
      finally { client.release(); }
    },
    // One pooled connection for the whole unit of work, so the actor setting and the write share a transaction.
    withActor: async (actor, fn) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(SET_ACTOR, [actor?.id || '', actor?.name || '']);
        const out = await fn({ query: (text, params = []) => client.query(text, params) });
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end()
  };
}
