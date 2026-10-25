// Loads the demonstration data in supabase/seed.sql. Refuses to run when inventory already has
// rows, so it never mixes demo records into existing data or overwrites anything.
//   npm run db:seed
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/lib/db.js';

export const SEED_FILE = fileURLToPath(new URL('../../supabase/seed.sql', import.meta.url));

export async function seed(db, { log = console.log } = {}) {
  const { rows } = await db.query('select count(*)::int as n from inventory_items');
  if (rows[0].n > 0) {
    log(`Skipped: inventory_items already has ${rows[0].n} row(s). The demo seed only loads into an empty database.`);
    return false;
  }
  await db.exec(readFileSync(SEED_FILE, 'utf8'));
  log('Demo data loaded.');
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = await createDb(loadConfig({ skipAuthConfig: true }));
  try {
    await seed(db);
  } catch (e) {
    console.error(`Seeding failed: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
