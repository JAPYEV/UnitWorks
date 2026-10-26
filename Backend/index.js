import { loadConfig } from './src/config.js';
import { createDb } from './src/lib/db.js';
import { createApp } from './src/app.js';

// Vercel owns the HTTP listener. Reuse one database pool per service instance.
const config = loadConfig();
if (config.dbDriver !== 'postgres') {
  throw new Error('Vercel requires DB_DRIVER=postgres. PGlite is for local development only.');
}
const db = await createDb(config);
export default createApp({ db, config });
