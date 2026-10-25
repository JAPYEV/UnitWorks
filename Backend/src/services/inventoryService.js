import { CATEGORIES, CAT, SPEC_FIELDS, IGPU, stockStatus, specText, has } from '../../../shared/uw-core.js';
import { HttpError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';

const CAT_KEYS = CATEGORIES.map(c => c.key);
const REASON_TYPE = { 'Supplier delivery': 'Received', 'Customer return': 'Return', 'Sale': 'Sale' };
export const ADJUST_REASONS = {
  receive: ['Supplier delivery', 'Customer return', 'Transfer in'],
  remove: ['Sale', 'Damaged', 'Transfer out', 'Lost or missing'],
  set: ['Cycle count', 'Data correction']
};

const ITEM_FIELDS = {
  name: { type: 'string', label: 'Product name', minLength: 4, maxLength: 160, required: true },
  brand: { type: 'string', label: 'Brand', maxLength: 60, required: true },
  price: { type: 'number', label: 'Selling price', gt: 0, max: 10_000_000, required: true },
  cost: { type: 'number', label: 'Unit purchasing cost', gt: 0, max: 10_000_000, required: true },
  minStock: { type: 'int', label: 'Minimum stock threshold', min: 0, max: 100_000, required: true },
  dailySales: { type: 'number', label: 'Avg daily sales', min: 0, max: 10_000, required: true },
  leadTime: { type: 'int', label: 'Supplier lead time', min: 1, max: 365, required: true },
  moq: { type: 'int', label: 'Minimum order qty', min: 1, max: 100_000, required: true },
  specs: { type: 'object', label: 'Specifications', default: {} }
};

function checkPrices(out, errors) {
  if (out.price !== undefined && out.cost !== undefined && out.cost > out.price) errors.cost = 'Cost is higher than the selling price.';
}

/** Validates spec values against the category's field definitions and normalizes them. */
export function cleanSpecs(category, specs, errors) {
  const fields = SPEC_FIELDS[category] || [];
  const out = {};
  for (const key of Object.keys(specs || {})) {
    if (!fields.some(f => f.key === key)) errors['specs.' + key] = `Unknown specification "${key}" for ${CAT[category].label}.`;
  }
  for (const f of fields) {
    const raw = specs ? specs[f.key] : undefined;
    if (!has(raw) || String(raw).trim() === '') { out[f.key] = null; continue; }
    const v = String(raw).trim();
    if (f.type === 'number') {
      if (!/^\d+(\.\d+)?$/.test(v)) errors['specs.' + f.key] = `${f.label} must be a non-negative number.`;
      else out[f.key] = Number(v);
    } else if (f.type === 'select') {
      if (!f.options.includes(v)) errors['specs.' + f.key] = `${f.label} must be one of: ${f.options.join(', ')}.`;
      else out[f.key] = v;
    } else out[f.key] = v;
  }
  return out;
}

const makeId = (category, name) =>
  ((category + '-' + name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 5));

export function inventoryService({ inventory }) {
  return {
    categories: () => inventory.listCategories(),

    async list(query) {
      const f = validate(query, {
        q: { type: 'string', maxLength: 100 },
        category: { type: 'enum', values: CAT_KEYS },
        status: { type: 'enum', values: ['in', 'low', 'out'] },
        demand: { type: 'enum', values: ['high', 'low'] },
        sort: { type: 'enum', values: ['name', 'category', 'price', 'stock', 'minStock', 'dailySales', 'status'], default: 'name' },
        dir: { type: 'enum', values: ['asc', 'desc'], default: 'asc' },
        page: { type: 'int', min: 1, default: 1 },
        pageSize: { type: 'int', min: 1, max: 100 }
      });
      const limit = f.pageSize ?? null;
      const res = await inventory.search({ ...f, limit, offset: limit ? (f.page - 1) * limit : 0 });
      const pages = limit ? Math.max(1, Math.ceil(res.total / limit)) : 1;
      return { items: res.items, meta: { total: res.total, page: limit ? f.page : 1, pageSize: limit, pages, counts: res.counts } };
    },

    async get(id) {
      const item = await inventory.get(id);
      if (!item) throw new HttpError(404, `Product ${id} not found.`);
      return item;
    },

    async create(body, actor) {
      const out = validate(body, {
        ...ITEM_FIELDS,
        category: { type: 'enum', label: 'Category', values: CAT_KEYS, required: true },
        stock: { type: 'int', label: 'Opening stock', min: 0, max: 100_000, default: 0 }
      }, (o, errors) => { checkPrices(o, errors); o.specs = cleanSpecs(o.category, o.specs, errors); });
      const id = makeId(out.category, out.name);
      await inventory.create({ ...out, id, sku: id.toUpperCase(), perf: { gaming: 50, work: 50, score: 50 } }, actor);
      return inventory.get(id);
    },

    async update(id, body, actor) {
      const current = await this.get(id);
      if (body && body.stock !== undefined) throw new HttpError(422, 'Stock changes must be recorded as a stock adjustment.');
      if (body && body.category !== undefined && body.category !== current.category) throw new HttpError(422, 'Category cannot change after creation.');
      const optional = Object.fromEntries(Object.entries(ITEM_FIELDS).map(([k, r]) => [k, { ...r, required: false, default: undefined }]));
      const out = validate(body, optional, (o, errors) => {
        checkPrices({ price: o.price ?? current.price, cost: o.cost ?? current.cost }, errors);
        if (body.specs !== undefined) o.specs = cleanSpecs(current.category, o.specs, errors);
      });
      await inventory.update(id, out, actor);
      return inventory.get(id);
    },

    async archive(id, actor) {
      await inventory.archive(id, actor);
    },

    /** mode receive | remove | set — every change is written to the movement ledger atomically. */
    async adjust(id, body, actor) {
      const out = validate(body, {
        mode: { type: 'enum', label: 'Adjustment type', values: ['receive', 'remove', 'set'], required: true },
        quantity: { type: 'int', label: 'Quantity', min: 0, max: 100_000, required: true },
        reason: { type: 'string', label: 'Reason', maxLength: 60, required: true },
        reference: { type: 'string', maxLength: 60 }
      }, (o, errors) => {
        if (!ADJUST_REASONS[o.mode].includes(o.reason)) errors.reason = `Reason must be one of: ${ADJUST_REASONS[o.mode].join(', ')}.`;
        if (o.mode !== 'set' && o.quantity === 0) errors.quantity = 'Enter a whole number greater than 0.';
      });
      let movement;
      if (out.mode === 'set') movement = await inventory.setStockCount(id, out.quantity, out.reason, actor);
      else {
        const delta = out.mode === 'receive' ? out.quantity : -out.quantity;
        movement = await inventory.adjustStock(id, delta, REASON_TYPE[out.reason] || 'Adjustment', out.reason, actor);
      }
      return { movement, item: await inventory.get(id), changed: !!movement };
    },

    async movements(query) {
      const f = validate(query, {
        itemId: { type: 'string', maxLength: 64 },
        limit: { type: 'int', min: 1, max: 200, default: 50 }
      });
      return inventory.listMovements(f);
    },

    // Component catalog: the same records, presented per category with integrated graphics as a GPU option.
    async components(query) {
      const f = validate(query, { category: { type: 'enum', values: CAT_KEYS } });
      const items = await inventory.listActive();
      const list = f.category ? items.filter(p => p.category === f.category) : items;
      if (!f.category || f.category === 'gpu') list.push(IGPU);
      return list.map(p => ({ ...p, specText: specText(p), status: stockStatus(p).key }));
    },

    async component(id) {
      const p = await this.get(id);
      return { ...p, specText: specText(p), status: stockStatus(p).key,
        specRows: (SPEC_FIELDS[p.category] || []).map(f => ({ key: f.key, label: f.label, unit: f.unit || null, value: has(p.specs[f.key]) ? p.specs[f.key] : null })) };
    }
  };
}
