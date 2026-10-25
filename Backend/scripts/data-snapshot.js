// Application-data recovery artifact, NOT a complete Supabase backup. Auth
// credentials, Storage, platform roles and external settings are out of scope.
// Export is read-only. Restore verification ALWAYS creates an in-memory PGlite.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, migrationManifest, withLiveReadOnly } from './data-audit.js';
import { createDb } from '../src/lib/db.js';
import { migrate } from './migrate.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const digest = rows => hash([...rows].sort().join('\n'));

export async function captureSnapshot(db) {
  await db.query("set local timezone='UTC'");
  const snapshot = { format: 1, scope: 'application-data-only', createdAt: new Date().toISOString(),
    migrations: migrationManifest(), tables: {} };
  for (const name of TABLES) {
    const rows = (await db.query(`select to_jsonb(t)::text as record from public.${name} t`)).rows.map(r => r.record);
    snapshot.tables[name] = { rows, sha256: digest(rows) };
  }
  return snapshot;
}

export async function verifySnapshot(snapshot) {
  if (snapshot.format !== 1 || snapshot.scope !== 'application-data-only') throw new Error('INVALID_SNAPSHOT');
  if (JSON.stringify(snapshot.migrations) !== JSON.stringify(migrationManifest())) throw new Error('MIGRATION_MANIFEST_MISMATCH');
  if (Object.keys(snapshot.tables).sort().join() !== [...TABLES].sort().join()) throw new Error('SNAPSHOT_TABLE_MISMATCH');
  for (const name of TABLES) {
    if (digest(snapshot.tables[name].rows) !== snapshot.tables[name].sha256) throw new Error('SNAPSHOT_CHECKSUM_MISMATCH');
  }
  // No configurable target: this function cannot restore into the live database.
  const db = await createDb({ dbDriver: 'pglite', pgliteDataDir: 'memory' });
  try {
    await migrate(db, { log: () => {} }); // auth.users deliberately absent; profiles restored without auth credentials
    await db.query('begin');
    await db.query("set local timezone='UTC'");
    // The reference-data migration preloads these two tables in this EMPTY sandbox.
    await db.query('delete from spec_definitions');
    await db.query('delete from component_categories');
    await db.query("select set_config('unitworks.stock_change','on',true)");
    for (const name of TABLES) {
      const columns = (await db.query(`select column_name from information_schema.columns
        where table_schema='public' and table_name=$1 order by ordinal_position`, [name])).rows
        .map(r => '"' + r.column_name.replaceAll('"', '""') + '"').join(',');
      for (const record of snapshot.tables[name].rows) {
        await db.query(`insert into public.${name} (${columns}) overriding system value
          select ${columns} from jsonb_populate_record(null::public.${name},$1::jsonb)`, [record]);
      }
    }
    // Explicit movement identities must not leave the next receipt colliding.
    await db.query(`select setval(pg_get_serial_sequence('inventory_movements','id'),
      greatest(coalesce((select max(id) from inventory_movements),0),1),
      exists(select 1 from inventory_movements))`);
    await db.query("select set_config('unitworks.stock_change','off',true)");
    const restored = await captureSnapshot(db);
    for (const name of TABLES) {
      if (restored.tables[name].sha256 !== snapshot.tables[name].sha256) throw new Error('RESTORE_CONTENT_MISMATCH');
    }
    const mismatches = (await db.query('select id from inventory_stock_audit where difference<>0')).rows.length;
    await db.query('rollback');
    return { status: 'verified', target: 'isolated-in-memory-pglite', scope: snapshot.scope,
      tableCounts: Object.fromEntries(TABLES.map(n => [n, snapshot.tables[n].rows.length])), ledgerMismatches: mismatches,
      limitations: ['Not a full Supabase recovery backup', 'Auth users/passwords/sessions and Storage are excluded',
        'Production schema/grants/platform restore has not been rehearsed'] };
  } finally { await db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, suppliedPath] = process.argv.slice(2);
    if (!['capture','verify'].includes(command)) throw new Error('USE_CAPTURE_OR_VERIFY');
    const path = resolve(suppliedPath || '.data/backups/phase2-app-data.json');
    if (command === 'capture') {
      const snapshot = await withLiveReadOnly(db => captureSnapshot(db));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(snapshot) + '\n', { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ status: 'snapshot_saved', path, scope: snapshot.scope }));
    }
    // Read back the actual artifact; do not verify just an in-memory export.
    const bytes = readFileSync(path);
    const result = { ...await verifySnapshot(JSON.parse(bytes)), artifactSha256: hash(bytes), verifiedAt: new Date().toISOString() };
    writeFileSync(path + '.verification.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(result));
  } catch (e) {
    console.error(JSON.stringify({ status: 'snapshot_failed', code: e.code || 'SNAPSHOT_FAILED' }));
    process.exitCode = 1;
  }
}
