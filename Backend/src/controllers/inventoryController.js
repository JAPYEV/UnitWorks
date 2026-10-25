import { sendData } from '../lib/http.js';

export const inventoryController = svc => ({
  categories: async (req, res) => sendData(res, await svc.categories()),
  list: async (req, res) => { const { items, meta } = await svc.list(req.query); sendData(res, items, { meta }); },
  get: async (req, res) => sendData(res, await svc.get(req.params.id)),
  create: async (req, res) => sendData(res, await svc.create(req.body, req.user), { status: 201 }),
  update: async (req, res) => sendData(res, await svc.update(req.params.id, req.body, req.user)),
  archive: async (req, res) => { await svc.archive(req.params.id, req.user); res.status(204).end(); },
  adjust: async (req, res) => {
    const out = await svc.adjust(req.params.id, req.body, req.user);
    sendData(res, out, { status: out.changed ? 201 : 200 });
  },
  movements: async (req, res) => sendData(res, await svc.movements(req.query)),
  itemMovements: async (req, res) => {
    await svc.get(req.params.id);
    sendData(res, await svc.movements({ ...req.query, itemId: req.params.id }));
  },
  components: async (req, res) => sendData(res, await svc.components(req.query)),
  component: async (req, res) => sendData(res, await svc.component(req.params.id))
});
