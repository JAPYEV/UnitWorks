import { sendData } from '../lib/http.js';

export const buildController = svc => ({
  validate: async (req, res) => sendData(res, await svc.validate(req.body)),
  search: async (req, res) => sendData(res, await svc.search(req.body)),
  list: async (req, res) => sendData(res, await svc.list()),
  get: async (req, res) => sendData(res, await svc.get(req.params.id)),
  create: async (req, res) => sendData(res, await svc.save(req.body, req.user), { status: 201 }),
  remove: async (req, res) => { await svc.remove(req.params.id, req.user); res.status(204).end(); }
});

export const optimizerController = svc => ({
  recommend: async (req, res) => sendData(res, await svc.recommend(req.body)),
  saveRun: async (req, res) => sendData(res, await svc.saveRun(req.body, req.user), { status: 201 }),
  listRuns: async (req, res) => sendData(res, await svc.listRuns())
});

export const restockController = svc => ({
  recommend: async (req, res) => sendData(res, await svc.recommend(req.body)),
  savePlan: async (req, res) => sendData(res, await svc.savePlan(req.body, req.user), { status: 201 }),
  list: async (req, res) => sendData(res, await svc.list()),
  get: async (req, res) => sendData(res, await svc.get(req.params.id)),
  receive: async (req, res) => sendData(res, await svc.receive(req.params.id, req.user))
});

export const dashboardController = svc => ({
  summary: async (req, res) => sendData(res, await svc.summary(req.user))
});
