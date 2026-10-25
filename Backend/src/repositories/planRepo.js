// SQL access for saved PC builds, optimization runs and restock plans.
const num = v => (v === null || v === undefined ? null : Number(v));
const iso = v => (v instanceof Date ? v.toISOString() : v);

function mapBuild(r, components = []) {
  return {
    id: r.id, name: r.name, source: r.source, budget: num(r.budget), totalPrice: num(r.total_price),
    status: r.compatibility_status, checks: r.checks, createdAt: iso(r.created_at), createdBy: r.created_by ?? null,
    components: components.map(c => ({ category: c.category_key, itemId: c.item_id, integrated: c.is_integrated_graphics, unitPrice: num(c.unit_price), name: c.item_name }))
  };
}

export function planRepo(db) {
  async function buildComponents(ids) {
    if (!ids.length) return [];
    const r = await db.query(
      `select c.*, i.name as item_name from pc_build_components c left join inventory_items i on i.id = c.item_id
       where c.build_id = any($1::uuid[])`, [ids]);
    return r.rows;
  }
  return {
    async saveBuild(payload, actor) {
      const r = await db.withActor(actor, tx => tx.query('select save_pc_build($1::jsonb) as id', [JSON.stringify(payload)]));
      return r.rows[0].id;
    },
    async listBuilds(limit = 20) {
      const r = await db.query('select * from pc_builds order by created_at desc limit $1', [limit]);
      const comps = await buildComponents(r.rows.map(b => b.id));
      return r.rows.map(b => mapBuild(b, comps.filter(c => c.build_id === b.id)));
    },
    async getBuild(id) {
      const r = await db.query('select * from pc_builds where id = $1', [id]);
      if (!r.rows[0]) return null;
      return mapBuild(r.rows[0], await buildComponents([id]));
    },
    async deleteBuild(id, actor) {
      const r = await db.withActor(actor, tx => tx.query('delete from pc_builds where id = $1 returning id', [id]));
      return r.rows.length > 0;
    },

    async saveOptimizationRun(payload, actor) {
      const r = await db.withActor(actor, tx => tx.query('select save_optimization_run($1::jsonb) as id', [JSON.stringify(payload)]));
      return r.rows[0].id;
    },
    async listOptimizationRuns(limit = 20) {
      const r = await db.query('select * from optimization_runs order by created_at desc limit $1', [limit]);
      return r.rows.map(x => ({
        id: x.id, budget: num(x.budget), useCase: x.use_case, feasible: x.feasible, score: num(x.score), totalPrice: num(x.total_price),
        buildId: x.build_id, priorities: { graphics: x.priority_graphics, processing: x.priority_processing, memory: x.priority_memory },
        cpuBrand: x.cpu_brand, gpuBrand: x.gpu_brand, minRam: x.min_ram_gb, excludeOOS: x.exclude_out_of_stock, lean: x.prefer_unspent,
        stats: x.stats, durationMs: num(x.duration_ms), createdAt: iso(x.created_at)
      }));
    },

    async saveRestockPlan(payload, actor) {
      const r = await db.withActor(actor, tx => tx.query('select save_restock_plan($1::jsonb) as id', [JSON.stringify(payload)]));
      return r.rows[0].id;
    },
    async listRestockPlans(limit = 10) {
      const r = await db.query(
        `select p.*, count(i.item_id) filter (where i.order_qty > 0)::int as funded_lines, coalesce(sum(i.order_qty), 0)::int as units
         from restock_plans p left join restock_plan_items i on i.plan_id = p.id
         group by p.id order by p.created_at desc limit $1`, [limit]);
      return r.rows.map(p => ({ id: p.id, budget: num(p.budget), coverDays: p.cover_days, totalCost: num(p.total_cost), remaining: num(p.remaining),
        status: p.status, receivedAt: iso(p.received_at), createdAt: iso(p.created_at), fundedLines: p.funded_lines, units: p.units,
        createdBy: p.created_by ?? null, receivedBy: p.received_by ?? null }));
    },
    async getRestockPlan(id) {
      const r = await db.query('select * from restock_plans where id = $1', [id]);
      const p = r.rows[0];
      if (!p) return null;
      const items = await db.query(
        `select pi.*, i.name from restock_plan_items pi join inventory_items i on i.id = pi.item_id where pi.plan_id = $1 order by pi.rank`, [id]);
      return { id: p.id, budget: num(p.budget), coverDays: p.cover_days, totalCost: num(p.total_cost), remaining: num(p.remaining),
        status: p.status, receivedAt: iso(p.received_at), createdAt: iso(p.created_at),
        items: items.rows.map(i => ({ itemId: i.item_id, name: i.name, rank: i.rank, urgency: i.urgency, decision: i.decision,
          recommendedQty: i.recommended_qty, orderQty: i.order_qty, unitCost: num(i.unit_cost), orderCost: num(i.order_cost), reason: i.reason })) };
    },
    async receiveRestockPlan(id, actor) {
      const r = await db.withActor(actor, tx => tx.query('select receive_restock_plan($1::uuid, $2) as lines', [id, actor.name]));
      return r.rows[0].lines;
    }
  };
}
