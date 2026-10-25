// SQL access for inventory items, specifications, categories and stock movements.
// Rows are mapped to the camelCase "product" shape used by shared/uw-core.js and the frontend.

const num = v => (v === null || v === undefined ? null : Number(v));
const iso = v => (v instanceof Date ? v.toISOString() : v);

export function mapItem(r) {
  const perf = {};
  if (r.perf_gaming !== null) perf.gaming = r.perf_gaming;
  if (r.perf_work !== null) perf.work = r.perf_work;
  if (r.perf_score !== null) perf.score = r.perf_score;
  return {
    id: r.id, sku: r.sku, category: r.category_key, brand: r.brand, name: r.name,
    price: num(r.price), cost: num(r.unit_cost), stock: r.stock, minStock: r.min_stock,
    dailySales: num(r.daily_sales), leadTime: r.lead_time_days, moq: r.moq,
    specs: r.specs || {}, perf, archived: !!r.archived_at,
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at)
  };
}

export const mapMovement = r => ({
  id: Number(r.id), productId: r.item_id, productName: r.item_name ?? null, type: r.movement_type,
  qty: r.quantity, stockAfter: r.stock_after, note: r.note, reference: r.reference, user: r.performed_by,
  userId: r.performed_by_user_id ?? null, date: iso(r.created_at)
});

const SORT_SQL = {
  name: 'i.name',
  category: 'c.label',
  price: 'i.price',
  stock: 'i.stock',
  minStock: 'i.min_stock',
  dailySales: 'i.daily_sales',
  status: 'case when i.stock <= 0 then 0 when i.stock <= i.min_stock then 1 else 2 end'
};
const STATUS_SQL = {
  out: 'i.stock <= 0',
  low: 'i.stock > 0 and i.stock <= i.min_stock',
  in: 'i.stock > i.min_stock'
};
export const HIGH_DEMAND_PER_DAY = 0.5;

export function inventoryRepo(db) {
  return {
    async listCategories() {
      const cats = await db.query('select key, label, icon, sort_order from component_categories order by sort_order');
      const defs = await db.query('select category_key, spec_key, label, data_type, unit, options from spec_definitions order by category_key, sort_order');
      return cats.rows.map(c => ({
        key: c.key, label: c.label, icon: c.icon,
        specFields: defs.rows.filter(d => d.category_key === c.key).map(d => ({ key: d.spec_key, label: d.label, type: d.data_type, unit: d.unit, options: d.options }))
      }));
    },

    async listActive() {
      const r = await db.query('select * from inventory_items_with_specs where archived_at is null order by name');
      return r.rows.map(mapItem);
    },

    /** Filtered, sorted, paginated listing. limit null = all rows. */
    async search({ q, category, status, demand, sort = 'name', dir = 'asc', limit = null, offset = 0 }) {
      const where = ['i.archived_at is null'], params = [];
      const p = v => { params.push(v); return `$${params.length}`; };
      if (q) where.push(`(i.name || ' ' || i.brand || ' ' || i.sku) ilike ${p('%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%')}`);
      if (category) where.push(`i.category_key = ${p(category)}`);
      if (status) where.push(STATUS_SQL[status]);
      if (demand === 'high') where.push(`i.daily_sales >= ${p(HIGH_DEMAND_PER_DAY)}`);
      if (demand === 'low') where.push(`i.daily_sales < ${p(HIGH_DEMAND_PER_DAY)}`);
      const order = `${SORT_SQL[sort] || SORT_SQL.name} ${dir === 'desc' ? 'desc' : 'asc'}, i.name asc`;
      const page = limit === null ? '' : ` limit ${p(limit)} offset ${p(offset)}`;
      const rows = await db.query(
        `select i.*, count(*) over() as total_count from inventory_items_with_specs i
         join component_categories c on c.key = i.category_key
         where ${where.join(' and ')} order by ${order}${page}`, params);
      const counts = await db.query(
        `select count(*)::int as "all",
                count(*) filter (where stock > min_stock)::int as "in",
                count(*) filter (where stock > 0 and stock <= min_stock)::int as low,
                count(*) filter (where stock <= 0)::int as out
         from inventory_items where archived_at is null`);
      const total = rows.rows.length ? Number(rows.rows[0].total_count) : 0;
      return { items: rows.rows.map(mapItem), total, counts: counts.rows[0] };
    },

    async get(id, { includeArchived = false } = {}) {
      const r = await db.query(`select * from inventory_items_with_specs where id = $1${includeArchived ? '' : ' and archived_at is null'}`, [id]);
      return r.rows[0] ? mapItem(r.rows[0]) : null;
    },

    async getMany(ids) {
      if (!ids.length) return [];
      const r = await db.query('select * from inventory_items_with_specs where id = any($1::text[])', [ids]);
      return r.rows.map(mapItem);
    },

    // Writes run inside db.withActor so the database attributes them to the signed-in user.
    async create(item, actor) {
      const r = await db.withActor(actor, tx => tx.query('select create_inventory_item($1::jsonb, $2) as id', [JSON.stringify(item), actor.name]));
      return r.rows[0].id;
    },

    async update(id, patch, actor) {
      await db.withActor(actor, tx => tx.query('select update_inventory_item($1, $2::jsonb)', [id, JSON.stringify(patch)]));
    },

    async archive(id, actor) {
      await db.withActor(actor, tx => tx.query('select archive_inventory_item($1)', [id]));
    },

    async adjustStock(id, delta, type, note, actor) {
      const r = await db.withActor(actor, tx => tx.query('select * from adjust_stock($1, $2, $3::movement_type, $4, null, $5)', [id, delta, type, note, actor.name]));
      return mapMovement(r.rows[0]);
    },

    async setStockCount(id, count, note, actor) {
      const r = await db.withActor(actor, tx => tx.query('select * from set_stock_count($1, $2, $3, $4)', [id, count, note, actor.name]));
      return r.rows[0] && r.rows[0].id !== null ? mapMovement(r.rows[0]) : null;
    },

    async listMovements({ itemId = null, limit = 50 } = {}) {
      const r = await db.query(
        `select m.*, i.name as item_name from inventory_movements m join inventory_items i on i.id = m.item_id
         where ($1::text is null or m.item_id = $1) order by m.created_at desc, m.id desc limit $2`, [itemId, limit]);
      return r.rows.map(mapMovement);
    },

    async stockAudit() {
      const r = await db.query('select * from inventory_stock_audit where difference <> 0');
      return r.rows;
    }
  };
}
