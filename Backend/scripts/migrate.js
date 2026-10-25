// Applies supabase/migrations/*.sql in filename order, each once, recording what ran in
// unitworks_meta.applied_migrations. Use either this script or the Supabase CLI (`supabase db push`)
// for a given database, not both: they keep separate migration histories.
//   npm run db:migrate          (DATABASE_URL from .env)
//   npm run db:local:setup      (embedded PGlite from .env.local)
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/lib/db.js';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));

export async function migrate(db, { log = console.log } = {}) {
  await db.exec(`create schema if not exists unitworks_meta;
    create table if not exists unitworks_meta.applied_migrations (name text primary key, applied_at timestamptz not null default now());`);
  const done = new Set((await db.query('select name from unitworks_meta.applied_migrations')).rows.map(r => r.name));
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    await db.exec(`begin;\n${sql}\n;insert into unitworks_meta.applied_migrations (name) values ('${f.replace(/'/g, "''")}');\ncommit;`);
    log(`applied ${f}`);
    applied++;
  }
  log(applied ? `${applied} migration(s) applied.` : 'Database is up to date.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = await createDb(loadConfig({ skipAuthConfig: true }));
  try {
    await migrate(db);
  } catch (e) {
    console.error(`Migration failed: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
