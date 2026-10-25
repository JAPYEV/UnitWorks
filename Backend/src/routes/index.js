import { Router } from 'express';
import { asyncHandler as h, sendData } from '../lib/http.js';
import { requirePermission as can } from '../middleware/auth.js';

/**
 * Mounts every REST resource under /api. The router is wrapped in `authenticate` by app.js, so every
 * route below requires a valid session; each route also declares the permission it needs
 * (see shared/permissions.js).
 */
export function apiRouter(c) {
  const r = Router();

  r.get('/me', (req, res) => sendData(res, req.user));

  r.get('/catalog/categories', can('catalog:view'), h(c.inventory.categories));

  r.get('/inventory', can('inventory:view'), h(c.inventory.list));
  r.post('/inventory', can('inventory:manage'), h(c.inventory.create));
  r.get('/inventory/movements', can('movements:view'), h(c.inventory.movements));
  r.get('/inventory/:id', can('inventory:view'), h(c.inventory.get));
  r.patch('/inventory/:id', can('inventory:manage'), h(c.inventory.update));
  r.delete('/inventory/:id', can('inventory:manage'), h(c.inventory.archive));
  r.get('/inventory/:id/movements', can('movements:view'), h(c.inventory.itemMovements));
  r.post('/inventory/:id/adjustments', can('inventory:adjust'), h(c.inventory.adjust));

  r.get('/components', can('catalog:view'), h(c.inventory.components));
  r.get('/components/:id', can('catalog:view'), h(c.inventory.component));

  r.post('/builds/validate', can('builds:run'), h(c.builds.validate));
  r.post('/builds/search', can('builds:run'), h(c.builds.search));
  r.get('/builds', can('builds:view'), h(c.builds.list));
  r.post('/builds', can('builds:save'), h(c.builds.create));
  r.get('/builds/:id', can('builds:view'), h(c.builds.get));
  r.delete('/builds/:id', can('builds:save'), h(c.builds.remove));

  r.post('/optimizer/recommendations', can('optimizer:run'), h(c.optimizer.recommend));
  r.get('/optimizer/runs', can('optimizer:view'), h(c.optimizer.listRuns));
  r.post('/optimizer/runs', can('optimizer:save'), h(c.optimizer.saveRun));

  r.post('/restock/recommendations', can('restock:view'), h(c.restock.recommend));
  r.get('/restock/plans', can('restock:view'), h(c.restock.list));
  r.post('/restock/plans', can('restock:save'), h(c.restock.savePlan));
  r.get('/restock/plans/:id', can('restock:view'), h(c.restock.get));
  r.post('/restock/plans/:id/receive', can('restock:receive'), h(c.restock.receive));

  r.get('/dashboard', can('dashboard:view'), h(c.dashboard.summary));
  return r;
}
