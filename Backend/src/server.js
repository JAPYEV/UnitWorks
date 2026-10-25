import { loadConfig } from './config.js';
import { createDb } from './lib/db.js';
import { createApp } from './app.js';

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(`Configuration error: ${e.message}`);
  process.exit(1);
}
const db = await createDb(config);
const app = createApp({ db, config });
const server = app.listen(config.port, () => {
  console.log(`UnitWorks API listening on http://localhost:${config.port} (database driver: ${config.dbDriver})`);
});
const shutdown = async () => {
  server.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
