// Business services that run the shared algorithms (shared/uw-core.js) on database records.
import { performance } from 'node:perf_hooks';
import {
  CATEGORIES, CAT, USE_CASES, indexProducts, checkBuild, backtrackSearch,
  optimizeBuild, scoreBuild, restockPlan, stockStatus, peso
} from '../../../shared/uw-core.js';
import { HttpError } from '../lib/errors.js';
import { roleHas } from '../../../shared/permissions.js';
import { validate } from '../lib/validate.js';

const CAT_KEYS = CATEGORIES.map(c => c.key);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const assertUuid = (id, what) => { if (!UUID.test(String(id))) throw new HttpError(404, `${what} not found.`); };

const timed = fn => { const t0 = performance.now(); const result = fn(); return { result, durationMs: Math.round((performance.now() - t0) * 100) / 100 }; };

/** Checks a { category: itemId } selection: known categories, existing active items in the right category. */
async function resolveSelection(inventory, selection, { allowMissing = true } = {}) {
  if (selection === null || typeof selection !== 'object' || Array.isArray(selection)) throw new HttpError(422, 'Selection must be an object of { category: productId }.');
  const errors = {};
  const entries = Object.entries(selection).filter(([, v]) => v !== null && v !== undefined && v !== '');
  for (const [cat, id] of entries) {
    if (!CAT_KEYS.includes(cat)) errors[cat] = `Unknown category "${cat}".`;
    else if (typeof id !== 'string') errors[cat] = 'Product ID must be text.';
    else if (id === 'igpu' && cat !== 'gpu') errors[cat] = 'Integrated graphics can only be chosen as the graphics option.';
  }
  if (Object.keys(errors).length) throw new HttpError(422, Object.values(errors)[0], { details: errors });
  const ids = entries.map(([, id]) => id).filter(id => id !== 'igpu');
  const found = await inventory.getMany(ids);
  const byId = indexProducts(found.filter(p => !p.archived));
  for (const [cat, id] of entries) {
    const p = byId[id];
    if (!p) errors[cat] = `Product ${id} not found.`;
    else if (p.category !== cat) errors[cat] = `${p.name} is a ${CAT[p.category].label}, not a ${CAT[cat].label}.`;
  }
  if (Object.keys(errors).length) throw new HttpError(422, Object.values(errors)[0], { details: errors });
  if (!allowMissing && entries.length === 0) throw new HttpError(422, 'Select at least one component.');
  return { sel: Object.fromEntries(entries), byId };
}

const budgetRule = { type: 'int', label: 'Budget', min: 1, max: 20_000_000 };

// ---------------------------------------------------------------------------
// PC builds and backtracking search
// ---------------------------------------------------------------------------
export function buildService({ inventory, plans }) {
  return {
    async validate(body) {
      const { sel, byId } = await resolveSelection(inventory, (body || {}).selection ?? {});
      return checkBuild(sel, byId);
    },

    async search(body) {
      const f = validate(body || {}, {
        locked: { type: 'object', label: 'Locked parts', default: {} },
        budget: budgetRule,
        inStockOnly: { type: 'boolean', default: false },
        maxSolutions: { type: 'int', min: 1, max: 50, default: 12 },
        traceLimit: { type: 'int', min: 0, max: 500, default: 180 }
      });
      const { sel } = await resolveSelection(inventory, f.locked);
      const products = await inventory.listActive();
      const { result, durationMs } = timed(() => backtrackSearch({ products, locked: sel, budget: f.budget ?? null, inStockOnly: f.inStockOnly, maxSolutions: f.maxSolutions, traceLimit: f.traceLimit }));
      return { ...result, durationMs };
    },

    async save(body, actor) {
      const f = validate(body || {}, {
        name: { type: 'string', label: 'Build name', maxLength: 120 },
        selection: { type: 'object', label: 'Selection', required: true },
        budget: budgetRule,
        source: { type: 'enum', values: ['builder', 'search', 'optimizer'], default: 'builder' }
      });
      const { sel, byId } = await resolveSelection(inventory, f.selection, { allowMissing: false });
      const res = checkBuild(sel, byId);
      const id = await plans.saveBuild(buildPayload(f.name || `Build ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, f.source, f.budget, res), actor);
      return plans.getBuild(id);
    },

    list: () => plans.listBuilds(),

    async get(id) {
      assertUuid(id, 'Build');
      const b = await plans.getBuild(id);
      if (!b) throw new HttpError(404, 'Build not found.');
      return b;
    },

    async remove(id, actor) {
      assertUuid(id, 'Build');
      if (!(await plans.deleteBuild(id, actor))) throw new HttpError(404, 'Build not found.');
    }
  };
}

function buildPayload(name, source, budget, res) {
  return {
    name, source, budget: budget ?? null, totalPrice: res.total, status: res.overall,
    checks: res.checks.map(c => ({ id: c.id, label: c.label, status: c.status, detail: c.detail })),
    components: Object.entries(res.b).map(([cat, p]) => ({ category: cat, itemId: p.virtual ? null : p.id, integrated: !!p.virtual, unitPrice: p.price || 0 }))
  };
}

// ---------------------------------------------------------------------------
// Build optimizer (dynamic programming)
// ---------------------------------------------------------------------------
const OPT_SCHEMA = {
  budget: { type: 'int', label: 'Budget', required: true, min: 15000, max: 500000, minMessage: 'Minimum budget is ₱15,000.', maxMessage: 'Maximum budget for this prototype is ₱500,000.' },
  useCase: { type: 'enum', label: 'Intended use', values: Object.keys(USE_CASES), default: 'Gaming' },
  pri: { type: 'object', label: 'Priorities', default: { graphics: 3, processing: 3, memory: 3 } },
  cpuBrand: { type: 'enum', values: ['Any', 'AMD', 'Intel'], default: 'Any' },
  gpuBrand: { type: 'enum', values: ['Any', 'NVIDIA', 'AMD'], default: 'Any' },
  minRam: { type: 'int', values: [0, 32, 64], min: 0, max: 64, default: 0 },
  excludeOOS: { type: 'boolean', default: true },
  lean: { type: 'boolean', default: false }
};

function optInputs(body) {
  return validate(body || {}, OPT_SCHEMA, (o, errors) => {
    if (![0, 32, 64].includes(o.minRam)) errors.minRam = 'Minimum memory must be 0, 32 or 64 GB.';
    const pri = {};
    for (const k of ['graphics', 'processing', 'memory']) {
      const v = Number(o.pri[k] ?? 3);
      if (!Number.isInteger(v) || v < 1 || v > 5) errors['pri.' + k] = `${k} priority must be a whole number from 1 to 5.`;
      pri[k] = v;
    }
    o.pri = pri;
  });
}

/** The recommended build plus three re-optimized alternatives (same logic the UI presented before). */
export function runOptimizer(products, run) {
  const base = { products, ...run };
  const rec = optimizeBuild(base);
  const alts = !rec.ok ? [] : [
    { key: 'gfx', label: 'Graphics-focused', input: { ...run, pri: { graphics: 5, processing: 2, memory: 2 } } },
    { key: 'prod', label: 'Productivity-focused', input: { ...run, pri: { graphics: 1, processing: 5, memory: 5 } } },
    { key: 'save', label: 'Lower cost', input: { ...run, pri: { ...run.pri }, budget: Math.round(run.budget * 0.8 / 100) * 100 } }
  ].filter(a => a.input.budget >= OPT_SCHEMA.budget.min)
    .map(a => ({ ...a, r: optimizeBuild({ products, ...a.input }) })).filter(a => a.r.ok);
  if (rec.ok) {
    const byId = indexProducts(products);
    for (const a of alts) a.userScore = scoreBuild(a.r.sel, byId, run.useCase, rec.w);
  }
  return { rec, alts };
}

export function optimizerService({ inventory, plans }) {
  return {
    async recommend(body) {
      const run = optInputs(body);
      const products = await inventory.listActive();
      const { result, durationMs } = timed(() => runOptimizer(products, run));
      const compat = result.rec.ok ? checkBuild(result.rec.sel, indexProducts(products)) : null;
      return { input: run, ...result, compatibility: compat && { overall: compat.overall, passes: compat.passes.length, fails: compat.fails.length, unknowns: compat.unknowns.length }, durationMs };
    },

    async saveRun(body, actor) {
      const out = await this.recommend(body);
      const { input: run, rec } = out;
      let build = null;
      if (rec.ok) {
        // Persist the exact catalog snapshot that produced the recommendation.
        // A second read could mix new prices/archive states with the old score/total.
        const res = checkBuild(rec.sel, indexProducts(rec.items.map(it => it.product)));
        build = buildPayload(`Optimizer · ${run.useCase} · ${peso(run.budget)}`, 'optimizer', run.budget, res);
      }
      const id = await plans.saveOptimizationRun({
        budget: run.budget, useCase: run.useCase, priorityGraphics: run.pri.graphics, priorityProcessing: run.pri.processing, priorityMemory: run.pri.memory,
        cpuBrand: run.cpuBrand, gpuBrand: run.gpuBrand, minRam: run.minRam, excludeOOS: run.excludeOOS, lean: run.lean,
        feasible: rec.ok, score: rec.ok ? Math.round(rec.score * 100) / 100 : null, totalPrice: rec.ok ? rec.total : null, build,
        stats: rec.ok
          ? { anchorsTotal: rec.anchorsTotal, anchorsFeasible: rec.anchorsFeasible, anchorsOver: rec.anchorsOver, anchorsInfeasible: rec.anchorsInfeasible, states: rec.states, budgetStates: rec.cap + 1, maxOptionsPerGroup: rec.maxK, unit: rec.unit }
          : { anchorsTotal: rec.anchorsTotal, anchorsInfeasible: rec.anchorsInfeasible, minFeasible: rec.minFeasible },
        durationMs: out.durationMs
      }, actor);
      return { id, ...out };
    },

    listRuns: () => plans.listOptimizationRuns()
  };
}

// ---------------------------------------------------------------------------
// Restock optimizer (greedy)
// ---------------------------------------------------------------------------
const RESTOCK_SCHEMA = {
  budget: { type: 'int', label: 'Purchasing budget', required: true, min: 0, max: 20_000_000, maxMessage: 'Budget is above the prototype limit of ₱20,000,000.' },
  coverDays: { type: 'int', label: 'Coverage days', default: 7 }
};
const restockInputs = body => validate(body || {}, RESTOCK_SCHEMA, (o, errors) => {
  if (![7, 14, 30].includes(o.coverDays)) errors.coverDays = 'Coverage must be 7, 14 or 30 days.';
});

function computePlan(products, budget, coverDays) {
  const { result: plan, durationMs } = timed(() => restockPlan(products, budget, coverDays));
  for (const r of plan.rows) delete r.p; // full product objects are not needed by clients
  return { ...plan, rows: undefined, candidateCount: plan.cands.length, durationMs };
}

export function restockService({ inventory, plans }) {
  return {
    async recommend(body) {
      const f = restockInputs(body);
      return computePlan(await inventory.listActive(), f.budget, f.coverDays);
    },

    async savePlan(body, actor) {
      const f = restockInputs(body);
      const plan = computePlan(await inventory.listActive(), f.budget, f.coverDays);
      if (!plan.cands.length) throw new HttpError(409, 'No product is at or below its reorder point, so there is nothing to save.');
      const id = await plans.saveRestockPlan({
        budget: f.budget, coverDays: f.coverDays, totalCost: plan.totalCost, remaining: plan.remaining,
        items: plan.cands.map(r => ({ itemId: r.id, rank: r.rank, urgency: r.urgency, decision: r.decision, recommendedQty: r.qty,
          orderQty: r.orderQty, unitCost: r.unitCost, orderCost: r.orderCost, reason: r.decision === 'skipped' ? `${r.reason}. Skipped: ${r.skipReason}` : r.reason }))
      }, actor);
      return { id, plan };
    },

    list: () => plans.listRestockPlans(),

    async get(id) {
      assertUuid(id, 'Restock plan');
      const p = await plans.getRestockPlan(id);
      if (!p) throw new HttpError(404, 'Restock plan not found.');
      return p;
    },

    async receive(id, actor) {
      assertUuid(id, 'Restock plan');
      const lines = await plans.receiveRestockPlan(id, actor);
      return { plan: await plans.getRestockPlan(id), lines };
    }
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export function dashboardService({ inventory }) {
  return {
    async summary(user) {
      // Movement history is admin-only (movements:view); other roles get the rest of the dashboard.
      const canSeeMovements = roleHas(user && user.role, 'movements:view');
      const [products, movements] = await Promise.all([inventory.listActive(), canSeeMovements ? inventory.listMovements({ limit: 8 }) : null]);
      const st = p => stockStatus(p).key;
      const outs = products.filter(p => st(p) === 'out'), lows = products.filter(p => st(p) === 'low');
      const plan = restockPlan(products, 0);
      const critical = plan.cands.filter(r => r.stock <= 0 || r.dts < r.lead);
      return {
        totals: {
          products: products.length, categories: CATEGORIES.length,
          units: products.reduce((s, p) => s + p.stock, 0),
          valueAtPrice: products.reduce((s, p) => s + p.stock * p.price, 0),
          valueAtCost: products.reduce((s, p) => s + p.stock * p.cost, 0),
          low: lows.length, out: outs.length, in: products.length - lows.length - outs.length
        },
        byCategory: CATEGORIES.map(c => {
          const l = products.filter(p => p.category === c.key);
          return { key: c.key, label: c.label, skus: l.length, units: l.reduce((s, p) => s + p.stock, 0),
            out: l.filter(p => st(p) === 'out').length, low: l.filter(p => st(p) === 'low').length };
        }),
        critical: critical.slice(0, 5).map(r => ({ id: r.id, name: r.name, stock: r.stock, reason: r.reason, urgency: r.urgency })),
        criticalCount: critical.length, reorderCount: plan.cands.length,
        recentMovements: movements,
        topDemand: products.slice().sort((a, b) => b.dailySales - a.dailySales).slice(0, 6)
          .map(p => ({ id: p.id, name: p.name, dailySales: p.dailySales, stock: p.stock, status: st(p) }))
      };
    }
  };
}
