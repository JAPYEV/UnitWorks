import React, { useEffect, useState } from 'react';
import * as U from '@shared/uw-core.js';
import { Icon, usePageState, mono, card, field, eyebrow, Pill, Modal, CloseBtn, Select, Spinner, ErrorBox } from '../components/ui.jsx';
import { inventoryApi } from '../services/api.js';
import { useAsync, usePending } from '../hooks/useAsync.js';

const PAGE = 10;
const GEN = [
  { key: 'name', label: 'Product name', type: 'text', span: '1 / -1', placeholder: 'e.g. Kingston FURY Beast 32GB DDR5-6000' },
  { key: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g. Kingston' },
  { key: 'category', label: 'Category', type: 'select' },
  { key: 'price', label: 'Selling price (₱)', type: 'num', placeholder: '0' },
  { key: 'cost', label: 'Unit purchasing cost (₱)', type: 'num', placeholder: '0' },
  { key: 'stock', label: 'Opening stock', type: 'int', placeholder: '0', addOnly: true },
  { key: 'minStock', label: 'Minimum stock threshold', type: 'int', placeholder: '0' },
  { key: 'dailySales', label: 'Avg daily sales', type: 'dec', placeholder: '0.5' },
  { key: 'leadTime', label: 'Supplier lead time (days)', type: 'int', placeholder: '7' },
  { key: 'moq', label: 'Minimum order qty', type: 'int', placeholder: '1' }
];
const REASONS = { receive: ['Supplier delivery', 'Customer return', 'Transfer in'], remove: ['Sale', 'Damaged', 'Transfer out', 'Lost or missing'], set: ['Cycle count', 'Data correction'] };
const opts = pairs => pairs.map(([value, label]) => ({ value, label }));
const CAT_OPTS = [{ value: 'all', label: 'All categories' }, ...U.CATEGORIES.map(c => ({ value: c.key, label: c.label }))];
const STATUS_OPTS = opts([['all', 'All statuses'], ['in', 'In stock'], ['low', 'Low stock'], ['out', 'Out of stock']]);
const DEMAND_OPTS = opts([['all', 'Any demand'], ['high', 'High (≥ 0.5/day)'], ['low', 'Low (< 0.5/day)']]);
const SORT_OPTS = opts([['name:1', 'Name A–Z'], ['price:-1', 'Price, high to low'], ['price:1', 'Price, low to high'], ['stock:1', 'Stock, lowest first'], ['dailySales:-1', 'Demand, highest first'], ['status:1', 'Status, critical first']]);
const HEADERS = [['name', 'Product', 'left'], ['category', 'Category', 'left'], ['price', 'Price', 'right'], ['stock', 'Stock', 'right'], ['minStock', 'Min', 'right'], ['dailySales', 'Sales/day', 'right'], ['status', 'Status', 'left'], [null, 'Actions', 'right']];
const INIT = { q: '', cat: 'all', status: 'all', demand: 'all', sort: { key: 'name', dir: 1 }, page: 1, filtersOpen: false, form: null, adjust: null, view: null };

function validate(f, products) {
  const v = f.v, e = {};
  const n = k => v[k].trim() === '' ? NaN : +v[k];
  if (!v.name.trim()) e.name = 'Product name is required.';
  else if (v.name.trim().length < 4) e.name = 'Use at least 4 characters.';
  else if (products.some(p => p.name.toLowerCase() === v.name.trim().toLowerCase() && p.id !== f.id)) e.name = 'A product with this name already exists.';
  if (!v.brand.trim()) e.brand = 'Brand is required.';
  if (!(n('price') > 0)) e.price = 'Enter a price above ₱0.';
  if (!(n('cost') > 0)) e.cost = 'Enter a cost above ₱0.';
  else if (n('price') > 0 && n('cost') > n('price')) e.cost = 'Cost is higher than the selling price.';
  const ints = ['minStock', 'leadTime', 'moq'].concat(f.mode === 'add' ? ['stock'] : []);
  ints.forEach(k => { const x = n(k); if (!Number.isInteger(x) || x < 0) e[k] = 'Use a whole number, 0 or more.'; });
  if (!e.leadTime && n('leadTime') < 1) e.leadTime = 'Lead time must be at least 1 day.';
  if (!e.moq && n('moq') < 1) e.moq = 'Minimum order must be at least 1.';
  if (!(n('dailySales') >= 0)) e.dailySales = 'Enter 0 or a positive number.';
  (U.SPEC_FIELDS[v.category] || []).forEach(sf => { const x = (f.specs[sf.key] || '').trim(); if (sf.type === 'number' && x && !(+x >= 0)) e['spec.' + sf.key] = 'Must be a number.'; });
  return e;
}

const iconBtn = { width: 32, height: 32, display: 'grid', placeItems: 'center', border: '1px solid #2C333D', borderRadius: 6, background: '#1C2129', color: '#C3C9D0' };
const mBtn = { height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13 };
const footBtn = { height: 40, padding: '0 14px', border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13 };
const submitBtn = { height: 40, padding: '0 16px', border: 'none', borderRadius: 6, background: '#A3E635', color: '#15191F', fontWeight: 600, fontSize: 13, '--hbg': '#B5F04F' };
const lbl = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#AEB5BE' };
const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 180px), 1fr))', gap: 12 };

export default function Inventory({ products = [], api = {}, vw = 1280, dataVersion = 0 }) {
  const [s, set] = usePageState('Inventory', INIT, st => ({ ...st, form: null, adjust: null, view: null, filtersOpen: false }));
  const canManage = api.can('inventory:manage'), canAdjust = api.can('inventory:adjust');
  const mobile = vw < 820;

  // Search, filters, sorting and pagination run on the server (GET /api/inventory).
  const [q, setQ] = useState(s.q.trim());
  useEffect(() => { const t = setTimeout(() => setQ(s.q.trim()), 250); return () => clearTimeout(t); }, [s.q]);
  const { key, dir } = s.sort;
  const { data, error, loading, reload } = useAsync(() => inventoryApi.list({
    q, category: s.cat, status: s.status, demand: s.demand, sort: key, dir: dir > 0 ? 'asc' : 'desc', page: s.page, pageSize: PAGE
  }), [q, s.cat, s.status, s.demand, key, dir, s.page, dataVersion]);
  const slice = data ? data.data : [];
  const meta = data ? data.meta : { total: 0, pages: 1, page: 1, counts: { all: 0, in: 0, low: 0, out: 0 } };
  const total = meta.total, pagesN = meta.pages, page = meta.page;
  useEffect(() => { if (data && s.page > meta.pages) set({ page: meta.pages }); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const openForm = p => {
    const v = p ? { name: p.name, brand: p.brand, category: p.category, price: String(p.price), cost: String(p.cost), stock: String(p.stock), minStock: String(p.minStock), dailySales: String(p.dailySales), leadTime: String(p.leadTime), moq: String(p.moq) }
      : { name: '', brand: '', category: 'cpu', price: '', cost: '', stock: '0', minStock: '3', dailySales: '0.3', leadTime: '7', moq: '1' };
    const specs = {}; if (p) Object.entries(p.specs || {}).forEach(([k, x]) => specs[k] = U.has(x) ? String(x) : '');
    set({ form: { mode: p ? 'edit' : 'add', id: p && p.id, v, specs, errors: {}, tried: false }, view: null });
  };
  const askDelete = p => api.confirm({ title: 'Delete this product?', body: `${p.name} (${p.stock} units in stock) will be removed from inventory and from the current PC Builder draft. Saved builds and its stock movement history keep their records.`,
    confirmLabel: 'Delete product', danger: true,
    onConfirm: async () => {
      try { await inventoryApi.archive(p.id); api.toast('success', 'Product deleted', p.name); api.refresh(); }
      catch (e) { api.toast('error', 'Delete failed', e.message); }
    } });
  const openAdj = p => set({ adjust: { id: p.id, mode: 'receive', qty: '', reason: REASONS.receive[0], error: null }, view: null });

  const counts = meta.counts;
  const activeFilters = (s.cat !== 'all') + (s.status !== 'all') + (s.demand !== 'all');
  const clearFilters = () => set({ q: '', cat: 'all', status: 'all', demand: 'all', page: 1 });
  const pages = []; const start = Math.max(1, Math.min(page - 2, pagesN - 4));
  for (let i = start; i <= Math.min(pagesN, start + 4); i++) pages.push(i);
  const setF = k => e => set({ [k]: e.target.value, page: 1 });

  const filterSelects = (
    <>
      <Select value={s.cat} onChange={setF('cat')} options={CAT_OPTS} aria-label="Filter by category" style={{ height: 38, minWidth: 150 }} />
      <Select value={s.status} onChange={setF('status')} options={STATUS_OPTS} aria-label="Filter by stock status" style={{ height: 38, minWidth: 140 }} />
      <Select value={s.demand} onChange={setF('demand')} options={DEMAND_OPTS} aria-label="Filter by demand" style={{ height: 38, minWidth: 140 }} />
    </>
  );
  const mobileSelect = (label, value, onChange, options) => (
    <label style={{ ...lbl, color: '#9AA3AE' }}>{label}<Select value={value} onChange={onChange} options={options} style={{ height: 44, fontSize: 14 }} /></label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'uwin .2s ease-out' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['all', 'All products', '#7D8692'], ['in', 'In stock', '#3FCF8E'], ['low', 'Low stock', '#F5B83D'], ['out', 'Out of stock', '#F2545B']].map(([k, l, c]) => {
          const on = s.status === k;
          return (
            <button key={k} onClick={() => set({ status: k, page: 1 })} aria-pressed={on} style={{ height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 6, border: `1px solid ${on ? '#4A535F' : '#2A313B'}`, background: on ? '#232932' : '#1C2129', fontSize: 12.5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{l}<span style={{ fontFamily: mono, color: '#9AA3AE' }}>{counts[k]}</span>
            </button>
          );
        })}
      </div>

      <div style={card}>
        <div style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #262C35' }}>
          <div style={{ flex: '1 1 220px', display: 'flex', alignItems: 'center', gap: 8, height: 38, border: '1px solid #333B46', borderRadius: 6, background: '#14181E', padding: '0 10px', minWidth: 0 }}>
            <Icon name="search" size={15} color="#7D8692" />
            <input value={s.q} onChange={e => set({ q: e.target.value, page: 1 })} placeholder="Search name, brand, or SKU" aria-label="Search products" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13 }} />
            {s.q && <button onClick={() => set({ q: '', page: 1 })} aria-label="Clear search" style={{ border: 'none', background: 'none', color: '#7D8692', padding: 0, display: 'grid' }}><Icon name="x" size={14} /></button>}
          </div>
          {!mobile && filterSelects}
          {mobile && (
            <button onClick={() => set({ filtersOpen: !s.filtersOpen })} aria-expanded={s.filtersOpen} style={{ height: 38, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${activeFilters ? '#A3E635' : '#333B46'}`, borderRadius: 6, background: '#232932', fontSize: 13 }}>
              <Icon name="sliders-horizontal" size={15} />Filters
              {activeFilters > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#A3E635', color: '#15191F', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{activeFilters}</span>}
            </button>
          )}
          {canManage ? <button className="h-bg" onClick={() => openForm(null)} style={{ height: 38, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 6, background: '#A3E635', color: '#15191F', fontSize: 13, fontWeight: 600, '--hbg': '#B5F04F' }}><Icon name="plus" size={16} />Add product</button>
            : <span title="Your role can view inventory but not change it" style={{ height: 38, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, border: '1px solid #2C333D', fontSize: 12.5, color: '#9AA3AE' }}><Icon name="lock" size={14} />View only</span>}
        </div>

        {mobile && s.filtersOpen && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid #262C35', background: '#191D23' }}>
            {mobileSelect('Category', s.cat, setF('cat'), CAT_OPTS)}
            {mobileSelect('Stock status', s.status, setF('status'), STATUS_OPTS)}
            {mobileSelect('Demand', s.demand, setF('demand'), DEMAND_OPTS)}
            {mobileSelect('Sort by', `${key}:${dir}`, e => { const [k, d] = e.target.value.split(':'); set({ sort: { key: k, dir: +d }, page: 1 }); }, SORT_OPTS)}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={clearFilters} style={{ flex: 1, height: 44, border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13.5 }}>Clear filters</button>
              <button onClick={() => set({ filtersOpen: false })} style={{ flex: 1, height: 44, border: 'none', borderRadius: 6, background: '#A3E635', color: '#15191F', fontWeight: 600, fontSize: 13.5 }}>Show {total} results</button>
            </div>
          </div>
        )}

        {error && <div style={{ padding: 12 }}><ErrorBox title="Couldn’t load products" error={error} onRetry={reload} /></div>}
        {!data && loading && <Spinner label="Loading products…" style={{ padding: '32px 16px' }} />}
        {data && total === 0 && (
          <div style={{ padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
            <Icon name="search-x" size={22} color="#7D8692" />
            <div style={{ fontSize: 14, fontWeight: 600 }}>No products match these filters</div>
            <div style={{ fontSize: 12.5, color: '#9AA3AE' }}>Try a different search term or clear the filters.</div>
            <button onClick={clearFilters} style={{ marginTop: 6, height: 34, padding: '0 12px', border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13 }}>Clear filters</button>
          </div>
        )}

        {!mobile && total > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
              <thead>
                <tr>
                  {HEADERS.map(([k, l, al]) => {
                    const on = k && key === k;
                    return (
                      <th key={l} scope="col" aria-sort={on ? (dir > 0 ? 'ascending' : 'descending') : 'none'} style={{ padding: 0, textAlign: al, fontWeight: 500, borderBottom: '1px solid #262C35', width: k === 'name' ? 'auto' : '1%' }}>
                        <button onClick={() => k && set({ sort: { key: k, dir: on ? -dir : 1 }, page: 1 })} disabled={!k}
                          style={{ width: '100%', height: 40, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: al === 'right' ? 'flex-end' : 'flex-start', gap: 5, border: 'none', background: 'none', fontFamily: mono, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: on ? '#E6E9ED' : '#7D8692', cursor: k ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                          {l}<Icon name={on ? (dir > 0 ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'} size={12} style={{ opacity: !k ? 0 : on ? 1 : 0.35 }} />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {slice.map(p => {
                  const st = U.stockStatus(p);
                  const act = (icon, title, onClick, danger) => (
                    <button className="h-bg h-c" onClick={onClick} title={title} aria-label={`${title} — ${p.name}`}
                      style={{ ...iconBtn, color: danger ? '#9AA3AE' : '#C3C9D0', '--hbg': danger ? 'rgba(242,84,91,0.1)' : '#2A313B', '--hc': danger ? '#F2545B' : '#A3E635' }}><Icon name={icon} size={14} /></button>
                  );
                  return (
                    <tr key={p.id} className="h-row" style={{ borderBottom: '1px solid #262C35' }}>
                      <td style={{ padding: '10px 12px', maxWidth: 340 }}>
                        <button onClick={() => set({ view: p.id })} style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 500, color: '#E6E9ED' }}>{p.name}</span>
                          <span style={{ fontFamily: mono, fontSize: 11, color: '#6B7480' }}>{p.sku}</span>
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#AEB5BE', whiteSpace: 'nowrap' }}>{U.CAT[p.category].label}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{U.peso(p.price)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, fontWeight: 600, color: st.key === 'in' ? '#E6E9ED' : st.color }}>{p.stock}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, color: '#9AA3AE' }}>{p.minStock}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, color: '#C3C9D0', whiteSpace: 'nowrap' }}>{p.dailySales.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px' }}><Pill color={st.color} bg={st.bg} dot>{st.label}</Pill></td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          {canAdjust && act('arrow-up-down', 'Adjust stock', () => openAdj(p))}
                          {canManage && act('pencil', 'Edit product', () => openForm(p))}
                          {act('eye', 'View specifications', () => set({ view: p.id }))}
                          {canManage && act('trash-2', 'Delete product', () => askDelete(p), true)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {mobile && total > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {slice.map(p => {
              const st = U.stockStatus(p);
              const cell = (l, v, extra) => <div><div style={{ fontSize: 11, color: '#7D8692' }}>{l}</div><div style={{ fontFamily: mono, fontSize: 12.5, ...extra }}>{v}</div></div>;
              return (
                <div key={p.id} style={{ padding: '14px 12px', borderBottom: '1px solid #262C35', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <button onClick={() => set({ view: p.id })} style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                      <span style={{ fontSize: 12, color: '#7D8692' }}>{U.CAT[p.category].label} · <span style={{ fontFamily: mono }}>{p.sku}</span></span>
                    </button>
                    <Pill color={st.color} bg={st.bg} style={{ flexShrink: 0 }}>{st.label}</Pill>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
                    {cell('Price', U.pesoShort(p.price))}
                    {cell('Stock', p.stock, { fontWeight: 600, color: st.key === 'in' ? '#E6E9ED' : st.color })}
                    {cell('Min', p.minStock)}
                    {cell('Sales/day', p.dailySales.toFixed(2))}
                  </div>
                  {(canAdjust || canManage) && <div style={{ display: 'flex', gap: 8 }}>
                    {canAdjust && <button onClick={() => openAdj(p)} style={{ ...mBtn, flex: 1 }}><Icon name="arrow-up-down" size={15} />Adjust stock</button>}
                    {canManage && <button onClick={() => openForm(p)} aria-label={`Edit ${p.name}`} style={{ ...mBtn, width: 44 }}><Icon name="pencil" size={15} /></button>}
                    {canManage && <button onClick={() => askDelete(p)} aria-label={`Delete ${p.name}`} style={{ ...mBtn, width: 44, color: '#F2545B' }}><Icon name="trash-2" size={15} /></button>}
                  </div>}
                </div>
              );
            })}
          </div>
        )}

        {total > 0 && (
          <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12.5, color: '#9AA3AE' }}>Showing {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total} products{loading ? ' · updating…' : ''}</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button onClick={() => set({ page: Math.max(1, page - 1) })} disabled={page <= 1} aria-label="Previous page" style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', border: '1px solid #333B46', borderRadius: 6, background: '#232932', opacity: page <= 1 ? 0.4 : 1 }}><Icon name="chevron-left" size={15} /></button>
              {pages.map(i => {
                const on = i === page;
                return <button key={i} onClick={() => set({ page: i })} aria-current={on ? 'page' : undefined} style={{ minWidth: 36, height: 36, padding: '0 8px', border: `1px solid ${on ? '#A3E635' : '#333B46'}`, borderRadius: 6, background: on ? '#A3E635' : '#232932', color: on ? '#15191F' : '#C3C9D0', fontFamily: mono, fontSize: 12.5 }}>{i}</button>;
              })}
              <button onClick={() => set({ page: Math.min(pagesN, page + 1) })} disabled={page >= pagesN} aria-label="Next page" style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', border: '1px solid #333B46', borderRadius: 6, background: '#232932', opacity: page >= pagesN ? 0.4 : 1 }}><Icon name="chevron-right" size={15} /></button>
            </div>
          </div>
        )}
      </div>

      {s.form && canManage && <ProductForm f={s.form} products={products} api={api} set={set} pad={mobile ? 12 : 20} />}
      {s.adjust && canAdjust && <AdjustForm a={s.adjust} products={products} api={api} set={set} pad={mobile ? 12 : 20} />}
      {s.view && <ProductView id={s.view} products={products} set={set} openForm={canManage ? openForm : null} openAdj={canAdjust ? openAdj : null} pad={mobile ? 12 : 20} />}
    </div>
  );
}

function ProductForm({ f, products, api, set, pad }) {
  const e = { ...(f.tried ? validate(f, products) : f.errors) };
  Object.assign(e, f.serverErrors || {}); // field errors returned by the API (e.g. duplicate name)
  const nErr = Object.keys(e).length;
  const [pending, runPending] = usePending();
  const upd = (k, x) => set(st => ({ form: { ...st.form, serverErrors: null, v: { ...st.form.v, [k]: x }, ...(k === 'category' ? { specs: {} } : {}) } }));
  const close = () => set({ form: null });
  const submit = ev => {
    ev.preventDefault();
    const errs = validate(f, products);
    if (Object.keys(errs).length) { set({ form: { ...f, errors: errs, tried: true } }); return; }
    const v = f.v, specs = {};
    (U.SPEC_FIELDS[v.category] || []).forEach(sf => { const x = (f.specs[sf.key] || '').trim(); specs[sf.key] = x === '' ? null : sf.type === 'number' ? +x : x; });
    const data = { name: v.name.trim(), brand: v.brand.trim(), category: v.category, price: Math.round(+v.price), cost: Math.round(+v.cost), minStock: +v.minStock, dailySales: +v.dailySales, leadTime: +v.leadTime, moq: +v.moq, specs };
    runPending(async () => {
      try {
        if (f.mode === 'add') {
          await inventoryApi.create({ ...data, stock: +v.stock });
          api.toast('success', 'Product added', `${data.name} is now in inventory.`);
          set({ form: null, q: '', cat: 'all', status: 'all', page: 1, sort: { key: 'name', dir: 1 } });
        } else {
          await inventoryApi.update(f.id, data);
          api.toast('success', 'Product updated', data.name);
          set({ form: null });
        }
        api.refresh();
      } catch (err) {
        const details = err.details ? Object.fromEntries(Object.entries(err.details).map(([k, m]) => [k.replace(/^specs\./, 'spec.'), m])) : null;
        const serverErrors = details || (err.status === 409 ? { name: err.message } : null);
        if (serverErrors) set(st => ({ form: st.form && { ...st.form, serverErrors, tried: true } }));
        api.toast('error', f.mode === 'add' ? 'Could not add product' : 'Could not save changes', err.message);
      }
    });
  };
  const isEdit = f.mode === 'edit';
  const errText = k => e[k] && <span style={{ fontSize: 11.5, color: '#F2545B' }}>{e[k]}</span>;

  return (
    <Modal as="form" onSubmit={submit} onClose={close} label={isEdit ? 'Edit product' : 'Add product'} width={640} pad={pad}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #2C333D', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{isEdit ? 'Edit product' : 'Add product'}</div>
          <div style={{ fontSize: 12, color: '#7D8692' }}>{isEdit ? 'Stock quantity is changed with Adjust stock so every change is logged.' : 'New products start with neutral performance scores (50) for the optimizers.'}</div>
        </div>
        <CloseBtn onClick={close} />
      </div>
      <div style={{ padding: '16px 20px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {f.tried && nErr > 0 && <div role="alert" style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(242,84,91,0.35)', background: 'rgba(242,84,91,0.07)', fontSize: 12.5, color: '#E6C3C5' }}>Fix {nErr} field(s) highlighted below before saving.</div>}
        <div style={eyebrow}>Product details</div>
        <div style={formGrid}>
          {GEN.filter(g => !(g.addOnly && isEdit)).map(g => {
            const border = e[g.key] ? '#F2545B' : '#333B46';
            const lockCat = g.key === 'category' && isEdit;
            return (
              <label key={g.key} style={{ ...lbl, gridColumn: g.span || 'auto' }}>{g.label}
                {g.type === 'select'
                  ? <Select value={f.v[g.key]} onChange={ev => upd(g.key, ev.target.value)} disabled={lockCat} options={U.CATEGORIES.map(c => ({ value: c.key, label: c.label }))} style={{ border: `1px solid ${border}`, opacity: lockCat ? 0.6 : 1 }} />
                  : <input className="f-acc" value={f.v[g.key]} onChange={ev => upd(g.key, ev.target.value)} placeholder={g.placeholder || ''} aria-invalid={e[g.key] ? 'true' : 'false'}
                      inputMode={g.type === 'text' ? 'text' : g.type === 'dec' || g.type === 'num' ? 'decimal' : 'numeric'}
                      style={{ ...field, border: `1px solid ${border}`, fontFamily: g.type === 'text' ? 'inherit' : mono }} />}
                {errText(g.key)}
                {lockCat && <span style={{ fontSize: 11.5, color: '#6B7480' }}>Category cannot change after creation.</span>}
              </label>
            );
          })}
        </div>
        <div style={{ ...eyebrow, marginTop: 4 }}>{U.CAT[f.v.category].label} specifications</div>
        <div style={formGrid}>
          {(U.SPEC_FIELDS[f.v.category] || []).map(sf => {
            const ek = 'spec.' + sf.key, border = e[ek] ? '#F2545B' : '#333B46';
            const onChange = ev => { const x = ev.target.value; set(st => ({ form: { ...st.form, serverErrors: null, specs: { ...st.form.specs, [sf.key]: x } } })); };
            return (
              <label key={sf.key} style={lbl}>{sf.label + (sf.unit ? ` (${sf.unit})` : '')}
                {sf.type === 'select'
                  ? <Select value={f.specs[sf.key] || ''} onChange={onChange} options={[{ value: '', label: 'Not specified' }, ...(sf.options || []).map(o => ({ value: o, label: o }))]} style={{ border: `1px solid ${border}` }} />
                  : <input className="f-acc" value={f.specs[sf.key] || ''} onChange={onChange} inputMode={sf.type === 'number' ? 'decimal' : 'text'}
                      placeholder={sf.type === 'number' ? 'Unknown' : 'e.g. ' + (sf.key === 'sockets' ? 'AM5, LGA1700' : sf.key === 'forms' ? 'ATX, Micro-ATX' : '—')}
                      style={{ ...field, border: `1px solid ${border}` }} />}
                {errText(ek)}
              </label>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: '#6B7480', lineHeight: 1.5 }}>Leave a specification blank if it is unknown. The PC Builder will mark checks that depend on it as “cannot verify” instead of assuming compatibility.</div>
      </div>
      <div style={{ padding: '14px 20px', borderTop: '1px solid #2C333D', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={close} style={footBtn}>Cancel</button>
        <button type="submit" className="h-bg" disabled={pending} style={{ ...submitBtn, opacity: pending ? 0.7 : 1 }}>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add product'}</button>
      </div>
    </Modal>
  );
}

function AdjustForm({ a, products, api, set, pad }) {
  const p = products.find(x => x.id === a.id);
  if (!p) return null;
  const close = () => set({ adjust: null });
  const upd = patch => set(st => ({ adjust: { ...st.adjust, ...patch } }));
  const qn = +a.qty, valid = a.qty.trim() !== '' && Number.isInteger(qn) && qn >= 0;
  const next = !valid ? p.stock : a.mode === 'receive' ? p.stock + qn : a.mode === 'remove' ? Math.max(0, p.stock - qn) : qn;
  const st = U.stockStatus({ ...p, stock: next });
  const [pending, runPending] = usePending();

  const submit = ev => {
    ev.preventDefault();
    const q = a.qty.trim() === '' ? NaN : +a.qty;
    let err = null;
    if (!Number.isInteger(q) || q < 0 || (a.mode !== 'set' && q === 0)) err = a.mode === 'set' ? 'Enter the counted quantity (0 or more).' : 'Enter a whole number greater than 0.';
    else if (a.mode === 'remove' && q > p.stock) err = `Only ${p.stock} units are in stock.`;
    if (err) return upd({ error: err });
    const delta = a.mode === 'receive' ? q : a.mode === 'remove' ? -q : q - p.stock;
    if (delta === 0) { close(); api.toast('info', 'No change', 'The counted quantity matches current stock.'); return; }
    const apply = () => runPending(async () => {
      try {
        const out = await inventoryApi.adjust(p.id, { mode: a.mode, quantity: q, reason: a.reason });
        close();
        api.toast('success', 'Stock updated', `${p.name}: ${p.stock} → ${out.item.stock} units.`);
        api.refresh();
      } catch (err) {
        upd({ error: err.message });
        api.toast('error', 'Stock not changed', err.message);
      }
    });
    if (delta < 0) {
      const n = p.stock + delta;
      api.confirm({ title: `Remove ${-delta} unit${delta < -1 ? 's' : ''}?`,
        body: `${p.name} will go from ${p.stock} to ${n} units (${a.reason.toLowerCase()}).${n === 0 ? ' It will become out of stock and unavailable for builds.' : n <= p.minStock ? ' It will fall to or below its minimum threshold.' : ''}`,
        confirmLabel: 'Remove stock', danger: true, onConfirm: apply });
    } else apply();
  };

  return (
    <Modal as="form" onSubmit={submit} onClose={close} label="Adjust stock" width={460} pad={pad}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #2C333D', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Adjust stock</div>
          <div style={{ fontSize: 12, color: '#7D8692', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
        </div>
        <CloseBtn onClick={close} />
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div role="radiogroup" aria-label="Adjustment type" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, padding: 3, background: '#14181E', border: '1px solid #2C333D', borderRadius: 7 }}>
          {[['receive', 'Receive +'], ['remove', 'Remove −'], ['set', 'Set count']].map(([k, l]) => {
            const on = a.mode === k;
            return <button key={k} type="button" role="radio" aria-checked={on} onClick={() => upd({ mode: k, reason: REASONS[k][0], error: null })}
              style={{ height: 36, border: 'none', borderRadius: 5, background: on ? '#2E3640' : 'transparent', color: on ? '#E6E9ED' : '#9AA3AE', fontSize: 12.5, fontWeight: 500 }}>{l}</button>;
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={lbl}>{a.mode === 'set' ? 'Counted quantity' : 'Quantity'}
            <input className="f-acc" value={a.qty} onChange={ev => upd({ qty: ev.target.value, error: null })} inputMode="numeric" aria-invalid={a.error ? 'true' : 'false'} autoFocus
              style={{ ...field, border: `1px solid ${a.error ? '#F2545B' : '#333B46'}`, fontSize: 14, fontFamily: mono }} />
          </label>
          <label style={lbl}>Reason
            <Select value={a.reason} onChange={ev => upd({ reason: ev.target.value })} options={REASONS[a.mode].map(o => ({ value: o, label: o }))} />
          </label>
        </div>
        {a.error && <div role="alert" style={{ fontSize: 12, color: '#F2545B', marginTop: -6 }}>{a.error}</div>}
        <div style={{ padding: 12, borderRadius: 7, background: '#171B21', border: '1px solid #262C35', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 11, color: '#7D8692' }}>Current</div><div style={{ fontFamily: mono, fontSize: 18 }}>{p.stock}</div></div>
          <Icon name="arrow-right" size={16} color="#7D8692" />
          <div><div style={{ fontSize: 11, color: '#7D8692' }}>After adjustment</div><div style={{ fontFamily: mono, fontSize: 18, color: next > p.stock ? '#3FCF8E' : next < p.stock ? '#F5B83D' : '#E6E9ED' }}>{next}</div></div>
          <Pill color={st.color} bg={st.bg} style={{ marginLeft: 'auto' }}>{st.label}</Pill>
        </div>
        <div style={{ fontSize: 11.5, color: '#6B7480' }}>Minimum stock threshold: {p.minStock} units. The change is logged as a stock movement and updates the dashboard and optimizers.</div>
      </div>
      <div style={{ padding: '14px 20px', borderTop: '1px solid #2C333D', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={close} style={footBtn}>Cancel</button>
        <button type="submit" className="h-bg" disabled={pending} style={{ ...submitBtn, opacity: pending ? 0.7 : 1 }}>{pending ? "Applying…" : "Apply adjustment"}</button>
      </div>
    </Modal>
  );
}

function ProductView({ id, products, set, openForm, openAdj, pad }) {
  const p = products.find(x => x.id === id);
  if (!p) return null;
  const close = () => set({ view: null });
  const st = U.stockStatus(p), cover = p.dailySales > 0 ? (p.stock / p.dailySales).toFixed(1) + ' d' : '—';
  const facts = [['Selling price', U.peso(p.price)], ['Unit cost', U.peso(p.cost)], ['Margin', Math.round((1 - p.cost / p.price) * 100) + '%'], ['Stock', p.stock + ' units'],
    ['Minimum', p.minStock + ' units'], ['Sales / day', p.dailySales.toFixed(2)], ['Days of cover', cover], ['Lead time · MOQ', p.leadTime + ' d · ' + p.moq]];
  return (
    <Modal onClose={close} label="Product details" width={560} pad={pad}>
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #2C333D', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: '#7D8692', fontFamily: mono }}>{U.CAT[p.category].label} · {p.sku}</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{p.name}</div>
        </div>
        <Pill color={st.color} bg={st.bg}>{st.label}</Pill>
        <CloseBtn onClick={close} size={34} />
      </div>
      <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12, borderBottom: '1px solid #2C333D' }}>
        {facts.map(([l, v]) => <div key={l}><div style={{ fontSize: 11, color: '#7D8692' }}>{l}</div><div style={{ fontFamily: mono, fontSize: 13, marginTop: 2 }}>{v}</div></div>)}
      </div>
      <div style={{ padding: '8px 20px 4px' }}>
        <div style={{ ...eyebrow, padding: '8px 0 2px' }}>Specifications</div>
        {(U.SPEC_FIELDS[p.category] || []).map(sf => {
          const x = p.specs[sf.key], known = U.has(x);
          return (
            <div key={sf.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid #262C35', fontSize: 13 }}>
              <span style={{ color: '#9AA3AE' }}>{sf.label}</span>
              <span style={{ textAlign: 'right', color: known ? '#E6E9ED' : '#F5B83D', fontFamily: mono, fontSize: 12.5 }}>{known ? x + (sf.unit ? ' ' + sf.unit : '') : 'Not specified'}</span>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '14px 20px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        {openAdj && <button onClick={() => openAdj(p)} style={{ ...footBtn, height: 38 }}>Adjust stock</button>}
        {openForm && <button onClick={() => openForm(p)} style={{ ...submitBtn, height: 38, padding: '0 14px' }}>Edit product</button>}
        {!openAdj && !openForm && <span style={{ fontSize: 12, color: '#7D8692' }}>View only for your role.</span>}
      </div>
    </Modal>
  );
}
