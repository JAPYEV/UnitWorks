import { loadConfig } from '../Backend/src/config.js';
import { createDb } from '../Backend/src/lib/db.js';
import { createApp } from '../Backend/src/app.js';

// Initialize once per function instance; reuse the database pool across requests.
// Vercel supplies the HTTP server, so do not call app.listen() here.
const config = loadConfig();
if (config.dbDriver !== 'postgres') {
  throw new Error('Vercel requires DB_DRIVER=postgres. PGlite is for local development only.');
}
const db = await createDb(config);
export default createApp({ db, config });
