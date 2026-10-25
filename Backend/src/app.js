import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { jsonReplacer } from './lib/http.js';
import { inventoryRepo } from './repositories/inventoryRepo.js';
import { planRepo } from './repositories/planRepo.js';
import { profileRepo } from './repositories/profileRepo.js';
import { authenticate, createTokenVerifier } from './middleware/auth.js';
import { inventoryService } from './services/inventoryService.js';
import { buildService, optimizerService, restockService, dashboardService } from './services/algorithmServices.js';
import { inventoryController } from './controllers/inventoryController.js';
import { buildController, optimizerController, restockController, dashboardController } from './controllers/algorithmControllers.js';

/**
 * Builds the Express app around a database adapter ({ query, withActor }).
 * `verifyToken` can be injected (tests); otherwise tokens are verified against the Supabase
 * project's published signing keys.
 */
export function createApp({ db, config, verifyToken }) {
  const deps = { inventory: inventoryRepo(db), plans: planRepo(db), config };
  const verify = verifyToken || createTokenVerifier({ supabaseUrl: config.supabaseUrl });
  const controllers = {
    inventory: inventoryController(inventoryService(deps)),
    builds: buildController(buildService(deps)),
    optimizer: optimizerController(optimizerService(deps)),
    restock: restockController(restockService(deps)),
    dashboard: dashboardController(dashboardService(deps))
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('json replacer', jsonReplacer);
  app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (req, res) => {
    try {
      await db.query('select 1');
      res.json({ data: { status: 'ok', database: 'up' } });
    } catch {
      res.status(503).json({ error: { code: 'database_unavailable', message: 'The API is running but the database is not reachable.' } });
    }
  });
  // Everything under /api except /api/health requires a verified Supabase session.
  app.use('/api', authenticate({ verifyToken: verify, profiles: profileRepo(db) }), apiRouter(controllers));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
