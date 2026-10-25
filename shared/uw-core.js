/* UnitWorks core: compatibility rules and the three algorithms (backtracking, dynamic programming, greedy).
   Shared by the Express backend (authoritative runs) and the React frontend (instant compatibility hints).
   No data and no UI code here; demo data lives in Backend/scripts/seed-data.js → supabase/seed.sql. */

export const CATEGORIES = [
  { key: 'cpu', label: 'CPU', icon: 'cpu' },
  { key: 'motherboard', label: 'Motherboard', icon: 'circuit-board' },
  { key: 'ram', label: 'Memory', icon: 'memory-stick' },
  { key: 'gpu', label: 'Graphics card', icon: 'monitor' },
  { key: 'cooler', label: 'CPU cooler', icon: 'fan' },
  { key: 'psu', label: 'Power supply', icon: 'zap' },
  { key: 'storage', label: 'Storage', icon: 'hard-drive' },
  { key: 'case', label: 'PC case', icon: 'box' }
];
export const CAT = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

export const SPEC_FIELDS = {
  cpu: [
    { key: 'socket', label: 'Socket', type: 'select', options: ['AM4', 'AM5', 'LGA1700'] },
    { key: 'cores', label: 'Cores / threads', type: 'text' },
    { key: 'maxPower', label: 'Max power draw', type: 'number', unit: 'W' },
    { key: 'igpu', label: 'Integrated graphics', type: 'select', options: ['Yes', 'No'] }
  ],
  motherboard: [
    { key: 'socket', label: 'Socket', type: 'select', options: ['AM4', 'AM5', 'LGA1700'] },
    { key: 'chipset', label: 'Chipset', type: 'text' },
    { key: 'form', label: 'Form factor', type: 'select', options: ['ATX', 'Micro-ATX', 'Mini-ITX'] },
    { key: 'memType', label: 'Memory type', type: 'select', options: ['DDR4', 'DDR5'] },
    { key: 'm2', label: 'M.2 slots', type: 'number' },
    { key: 'sata', label: 'SATA ports', type: 'number' },
    { key: 'wifi', label: 'Wi-Fi', type: 'select', options: ['Yes', 'No'] }
  ],
  ram: [
    { key: 'type', label: 'Generation', type: 'select', options: ['DDR4', 'DDR5'] },
    { key: 'capacity', label: 'Kit capacity', type: 'number', unit: 'GB' },
    { key: 'speed', label: 'Speed', type: 'number', unit: 'MT/s' }
  ],
  gpu: [
    { key: 'chipBrand', label: 'GPU vendor', type: 'select', options: ['NVIDIA', 'AMD', 'Intel'] },
    { key: 'vram', label: 'VRAM', type: 'number', unit: 'GB' },
    { key: 'length', label: 'Card length', type: 'number', unit: 'mm' },
    { key: 'power', label: 'Board power', type: 'number', unit: 'W' },
    { key: 'pcie8', label: '8-pin PCIe connectors', type: 'number' },
    { key: 'hpwr', label: '16-pin (12V-2×6) connector', type: 'select', options: ['Yes', 'No'] }
  ],
  cooler: [
    { key: 'type', label: 'Type', type: 'select', options: ['Air', 'AIO'] },
    { key: 'sockets', label: 'Supported sockets', type: 'text' },
    { key: 'height', label: 'Height (air)', type: 'number', unit: 'mm' },
    { key: 'radiator', label: 'Radiator (AIO)', type: 'number', unit: 'mm' },
    { key: 'rating', label: 'Cooling rating', type: 'number', unit: 'W' }
  ],
  psu: [
    { key: 'watt', label: 'Capacity', type: 'number', unit: 'W' },
    { key: 'efficiency', label: 'Efficiency', type: 'text' },
    { key: 'pcie8', label: '8-pin PCIe connectors', type: 'number' },
    { key: 'hpwr', label: '16-pin (12V-2×6) connector', type: 'select', options: ['Yes', 'No'] }
  ],
  storage: [
    { key: 'iface', label: 'Interface', type: 'select', options: ['NVMe', 'SATA'] },
    { key: 'capacity', label: 'Capacity', type: 'number', unit: 'GB' },
    { key: 'kind', label: 'Form', type: 'text' }
  ],
  case: [
    { key: 'forms', label: 'Motherboard support', type: 'text' },
    { key: 'maxGpu', label: 'Max GPU length', type: 'number', unit: 'mm' },
    { key: 'maxCooler', label: 'Max cooler height', type: 'number', unit: 'mm' },
    { key: 'maxRad', label: 'Max radiator', type: 'number', unit: 'mm' }
  ]
};

export const IGPU = { id: 'igpu', virtual: true, sku: '—', category: 'gpu', brand: 'Integrated', name: 'Integrated graphics (no discrete card)',
  price: 0, cost: 0, stock: null, minStock: 0, dailySales: 0, leadTime: 0, moq: 0,
  specs: { chipBrand: 'Integrated', vram: null, length: 0, power: 0, pcie8: 0, hpwr: 'No' }, perf: { gaming: 8, work: 12 } };

// ---------- helpers ----------
export const clone = o => JSON.parse(JSON.stringify(o));
export const has = v => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && isNaN(v));
export const num = v => (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(+v) && +v >= 0 ? +v : null;
const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const EPS = 1e-9;
function moneyCents(value, label = 'Money', zero = true) {
  const c = Math.round(value * 100);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!zero && value === 0)
    || !Number.isSafeInteger(c) || c > Number.MAX_SAFE_INTEGER / 32 || Number(value.toFixed(2)) !== value) {
    throw new RangeError(`${label} must be a safe ${zero ? 'non-negative' : 'positive'} amount with at most two decimal places`);
  }
  return c;
}
function whole(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) throw new RangeError(`${label} must be a whole number >= ${min}`);
}
function algorithmCatalog(products, restock = false) {
  if (!Array.isArray(products)) throw new RangeError('Products must be an array');
  const seen = new Set();
  const real = products.filter(p => !p?.virtual && !p?.archived);
  for (const p of real) {
    if (!p || typeof p.id !== 'string' || !p.id || p.id === 'igpu' || seen.has(p.id) || !Object.hasOwn(CAT,p.category)) throw new RangeError('Invalid or duplicate product identity/category');
    seen.add(p.id);
    moneyCents(restock ? p.cost : p.price, restock ? 'Unit cost' : 'Price', false);
    whole(p.stock, 'Stock');
    if (!restock && p.perf && Object.values(p.perf).some(v => v != null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100))) throw new RangeError('Performance scores must be between 0 and 100');
  }
  return real.map(normalizedProduct).sort(compareId);
}
function normalizedProduct(p) {
  const specs = { ...(p.specs || {}) };
  for (const field of SPEC_FIELDS[p.category] || []) {
    if (field.type === 'number') specs[field.key] = num(specs[field.key]);
    if (field.type === 'select' && !field.options.includes(specs[field.key])) specs[field.key] = null;
  }
  return { ...p, specs };
}
export const list = s => (has(s) ? String(s) : '').split(',').map(x => x.trim()).filter(Boolean);
export const peso = n => (n < 0 ? '−' : '') + '₱' + Math.round(Math.abs(n || 0)).toLocaleString('en-US');
export const pesoShort = n => n >= 1e6 ? '₱' + (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? '₱' + (n / 1e3).toFixed(1) + 'k' : peso(n);
export const fmtDate = s => { const d = new Date(s); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toTimeString().slice(0, 5); };

export const STATUS = {
  in: { key: 'in', label: 'In stock', color: '#3FCF8E', bg: 'rgba(63,207,142,0.12)' },
  low: { key: 'low', label: 'Low stock', color: '#F5B83D', bg: 'rgba(245,184,61,0.12)' },
  out: { key: 'out', label: 'Out of stock', color: '#F2545B', bg: 'rgba(242,84,91,0.12)' }
};
export function stockStatus(p) {
  if (!p || p.virtual) return STATUS.in;
  if (p.stock <= 0) return STATUS.out;
  if (p.stock <= p.minStock) return STATUS.low;
  return STATUS.in;
}
export function indexProducts(products) {
  const m = Object.assign(Object.create(null), { igpu: IGPU });
  for (const p of products) m[p.id] = p;
  return m;
}
export function candidatesFor(products, cat, inStockOnly) {
  const l = products.filter(p => !p.archived && !p.virtual && p.category === cat && (!inStockOnly || p.stock > 0));
  if (cat === 'gpu') l.push(IGPU);
  return l;
}
export function specText(p) {
  if (!p) return '';
  if (p.virtual) return 'Uses the CPU’s built-in graphics';
  const s = p.specs || {};
  const v = (x, u) => has(x) ? x + (u || '') : '?';
  switch (p.category) {
    case 'cpu': return `${v(s.socket)} · ${v(s.cores)} cores · ${v(s.maxPower, ' W')} · iGPU ${v(s.igpu)}`;
    case 'motherboard': return `${v(s.socket)} · ${v(s.form)} · ${v(s.memType)} · ${v(s.m2)}× M.2`;
    case 'ram': return `${v(s.type)} · ${v(s.capacity, ' GB')} · ${v(s.speed, ' MT/s')}`;
    case 'gpu': return `${v(s.vram, ' GB')} · ${v(s.length, ' mm')} · ${v(s.power, ' W')} · ${s.hpwr === 'Yes' ? '16-pin' : v(s.pcie8) + '× 8-pin'}`;
    case 'cooler': return `${v(s.type)} · ${s.type === 'AIO' ? v(s.radiator, ' mm rad') : v(s.height, ' mm')} · ${v(s.rating, ' W')} · ${v(s.sockets)}`;
    case 'psu': return `${v(s.watt, ' W')} · ${v(s.efficiency)} · ${v(s.pcie8)}× 8-pin${s.hpwr === 'Yes' ? ' + 16-pin' : ''}`;
    case 'storage': return `${v(s.iface)} · ${has(s.capacity) ? (s.capacity >= 1000 ? s.capacity / 1000 + ' TB' : s.capacity + ' GB') : '?'} · ${v(s.kind)}`;
    case 'case': return `${v(s.forms)} · GPU ≤ ${v(s.maxGpu, ' mm')} · cooler ≤ ${v(s.maxCooler, ' mm')}`;
  }
  return '';
}

// ---------- compatibility constraints ----------
const OK = m => ({ s: 'pass', m }), NO = m => ({ s: 'fail', m }), UN = m => ({ s: 'unknown', m });
export function powerEstimate(cpu, gpu) {
  const c = num(cpu.specs.maxPower), g = gpu.virtual ? 0 : num(gpu.specs.power);
  if (c == null || g == null) return null;
  const load = c + g + 75;
  return { load, rec: Math.ceil(load * 1.25 / 50) * 50 };
}
export const CONSTRAINTS = [
  { id: 'socket', label: 'CPU socket matches motherboard', short: 'Socket mismatch', cats: ['cpu', 'motherboard'],
    rule: 'cpu.socket = motherboard.socket',
    test: b => { const a = b.cpu.specs.socket, m = b.motherboard.specs.socket;
      if (!has(a) || !has(m)) return UN('Socket not specified for CPU or motherboard');
      return a === m ? OK(`Both use ${a}`) : NO(`${b.cpu.name} needs ${a}; ${b.motherboard.name} is ${m}`); } },
  { id: 'memory', label: 'RAM generation supported by motherboard', short: 'Memory type', cats: ['ram', 'motherboard'],
    rule: 'ram.type = motherboard.memType',
    test: b => { const r = b.ram.specs.type, m = b.motherboard.specs.memType;
      if (!has(r) || !has(m)) return UN('Memory generation not specified');
      return r === m ? OK(`${r} kit on a ${m} board`) : NO(`Board supports ${m} only; kit is ${r}`); } },
  { id: 'form', label: 'Case supports motherboard form factor', short: 'Form factor', cats: ['motherboard', 'case'],
    rule: 'motherboard.form ∈ case.forms',
    test: b => { const f = b.motherboard.specs.form, fs = list(b.case.specs.forms);
      if (!has(f) || !fs.length) return UN('Form factor support not specified');
      return fs.includes(f) ? OK(`${f} fits (${fs.join(', ')})`) : NO(`${f} board does not fit; case supports ${fs.join(', ')}`); } },
  { id: 'display', label: 'Display output available', short: 'No graphics output', cats: ['cpu', 'gpu'],
    rule: 'gpu ≠ integrated OR cpu.igpu = Yes',
    test: b => { if (!b.gpu.virtual) return OK('Discrete graphics card selected');
      const i = b.cpu.specs.igpu; if (!has(i)) return UN('CPU integrated graphics not specified');
      return i === 'Yes' ? OK('CPU integrated graphics will drive displays') : NO(`${b.cpu.name} has no integrated graphics; a graphics card is required`); } },
  { id: 'gpuClear', label: 'Graphics card fits in case', short: 'GPU length', cats: ['gpu', 'case'],
    rule: 'gpu.length ≤ case.maxGpu',
    test: b => { if (b.gpu.virtual) return OK('No discrete card to fit');
      const l = num(b.gpu.specs.length), m = num(b.case.specs.maxGpu);
      if (l == null) return UN(`Card length not specified for ${b.gpu.name}`);
      if (m == null) return UN('Case GPU clearance not specified');
      return l <= m ? OK(`${l} mm card, ${m} mm clearance`) : NO(`Card is ${l} mm; case allows ${m} mm`); } },
  { id: 'coolerSocket', label: 'Cooler supports CPU socket', short: 'Cooler socket', cats: ['cooler', 'cpu'],
    rule: 'cpu.socket ∈ cooler.sockets',
    test: b => { const s = b.cpu.specs.socket, ss = list(b.cooler.specs.sockets);
      if (!has(s) || !ss.length) return UN('Cooler socket support not specified');
      return ss.includes(s) ? OK(`Mounts on ${s}`) : NO(`Cooler supports ${ss.join(', ')}; CPU is ${s}`); } },
  { id: 'coolerFit', label: 'Cooler fits in case', short: 'Cooler clearance', cats: ['cooler', 'case'],
    rule: 'air: height ≤ case.maxCooler · AIO: radiator ≤ case.maxRad',
    test: b => { const c = b.cooler.specs, k = b.case.specs;
      if (!['Air', 'AIO'].includes(c.type)) return UN('Cooler type not specified or unsupported');
      if (c.type === 'AIO') { const r = num(c.radiator), m = num(k.maxRad);
        if (r == null || m == null) return UN('Radiator size or support not specified');
        return r <= m ? OK(`${r} mm radiator, case supports up to ${m} mm`) : NO(`${r} mm radiator; case supports ${m} mm`); }
      const h = num(c.height), m = num(k.maxCooler);
      if (h == null || m == null) return UN('Cooler height or case clearance not specified');
      return h <= m ? OK(`${h} mm tall, ${m} mm clearance`) : NO(`Cooler is ${h} mm; case allows ${m} mm`); } },
  { id: 'coolerRating', label: 'Cooler handles CPU heat output', short: 'Cooling capacity', cats: ['cooler', 'cpu'],
    rule: 'cooler.rating ≥ cpu.maxPower',
    test: b => { const r = num(b.cooler.specs.rating), p = num(b.cpu.specs.maxPower);
      if (r == null || p == null) return UN('Cooler rating or CPU power not specified');
      return r >= p ? OK(`Rated ${r} W for a ${p} W CPU`) : NO(`Rated ${r} W; CPU can draw ${p} W`); } },
  { id: 'psuWatt', label: 'PSU wattage covers estimated load', short: 'PSU wattage', cats: ['psu', 'cpu', 'gpu'],
    rule: 'psu.watt ≥ ⌈(cpu + gpu + 75 W) × 1.25⌉₅₀',
    test: b => { const e = powerEstimate(b.cpu, b.gpu), w = num(b.psu.specs.watt);
      if (!e || w == null) return UN('Power figures not specified');
      return w >= e.rec ? OK(`${w} W for ~${e.load} W load (needs ${e.rec} W)`) : NO(`~${e.load} W load needs ${e.rec} W; PSU is ${w} W`); } },
  { id: 'psuConn', label: 'PSU has required GPU power connectors', short: 'PSU connectors', cats: ['psu', 'gpu'],
    rule: 'psu 8-pin ≥ gpu 8-pin; 16-pin native or 2× 8-pin adapter',
    test: b => { if (b.gpu.virtual) return OK('No GPU power connectors needed');
      const g = b.gpu.specs, s = b.psu.specs, sp = num(s.pcie8);
      if (!['Yes', 'No'].includes(g.hpwr)) return UN('GPU connector type not specified');
      if (g.hpwr === 'Yes') { if (s.hpwr === 'Yes') return OK('Native 16-pin connector');
        if (sp == null || sp < 2 && s.hpwr !== 'No') return UN('PSU connector support not specified');
        return sp >= 2 ? OK('16-pin via included 2× 8-pin adapter') : NO(`Card needs 16-pin (or 2× 8-pin adapter); PSU has ${sp}× 8-pin`); }
      const need = num(g.pcie8); if (need == null) return UN('GPU connectors not specified');
      if (need > 0 && sp == null) return UN('PSU 8-pin connectors not specified');
      return sp >= need ? OK(need ? `${need}× 8-pin needed, ${sp} available` : 'Slot-powered card') : NO(`Card needs ${need}× 8-pin; PSU has ${sp}`); } },
  { id: 'storage', label: 'Storage interface supported by motherboard', short: 'Storage interface', cats: ['storage', 'motherboard'],
    rule: 'NVMe → m2 ≥ 1 · SATA → sata ≥ 1',
    test: b => { const i = b.storage.specs.iface, m = b.motherboard.specs;
      if (!['NVMe', 'SATA'].includes(i)) return UN('Storage interface not specified or unsupported');
      const slots = i === 'NVMe' ? num(m.m2) : num(m.sata);
      if (slots == null) return UN('Motherboard slot count not specified');
      return slots >= 1 ? OK(`${i} drive, ${slots} ${i === 'NVMe' ? 'M.2 slot(s)' : 'SATA port(s)'}`) : NO(`Board has fewer than one ${i === 'NVMe' ? 'M.2 slot' : 'SATA port'}`); } }
];

function resolve(sel, byId) {
  const b = {};
  for (const c of CATEGORIES) { const id = sel && sel[c.key]; if (id && byId[id]?.category === c.key) b[c.key] = normalizedProduct(byId[id]); }
  return b;
}
export function checkBuild(sel, byId) {
  const b = resolve(sel, byId);
  const checks = CONSTRAINTS.map(k => {
    const miss = k.cats.filter(c => !b[c]);
    if (miss.length) return { id: k.id, label: k.label, short: k.short, cats: k.cats, status: 'pending', detail: 'Needs ' + miss.map(c => CAT[c].label).join(' + ') };
    const r = k.test(b);
    return { id: k.id, label: k.label, short: k.short, cats: k.cats, status: r.s, detail: r.m };
  });
  const missing = CATEGORIES.filter(c => !b[c.key]);
  const fails = checks.filter(c => c.status === 'fail'), unknowns = checks.filter(c => c.status === 'unknown'),
    passes = checks.filter(c => c.status === 'pass');
  const overall = fails.length ? 'incompatible' : missing.length ? 'incomplete' : unknowns.length ? 'unverified' : 'compatible';
  const total = Object.values(b).reduce((s, p) => s + moneyCents(p.price), 0) / 100;
  const oos = Object.values(b).filter(p => !p.virtual && p.stock <= 0);
  return { b, checks, missing, fails, unknowns, passes, overall, total, oos };
}
export function feasible(b) {
  for (const k of CONSTRAINTS) { if (!k.cats.every(c => b[c])) continue; if (k.test(b).s !== 'pass') return false; }
  return true;
}

// ---------- BACKTRACKING: compatibility search ----------
export const SEARCH_ORDER = ['cpu', 'motherboard', 'ram', 'case', 'cooler', 'gpu', 'psu', 'storage'];
export function backtrackSearch(opts) {
  const { locked = {}, budget = null, inStockOnly = false, maxSolutions = 12, maxNodes = 40000, traceLimit = 180 } = opts;
  const products = algorithmCatalog(opts.products);
  const budgetCents = budget == null ? null : moneyCents(budget, 'Budget');
  if (typeof inStockOnly !== 'boolean') throw new RangeError('Stock filter must be boolean');
  whole(maxSolutions, 'Solution limit', 1); whole(maxNodes, 'Node limit', 1); whole(traceLimit, 'Trace limit');
  const byId = indexProducts(products);
  if (!locked || typeof locked !== 'object' || Array.isArray(locked)) throw new RangeError('Locks must be an object');
  for (const [cat,id] of Object.entries(locked)) if (!SEARCH_ORDER.includes(cat) || !byId[id] || byId[id].category !== cat) throw new RangeError('Locked product must exist in its category');
  const cands = {};
  for (const cat of SEARCH_ORDER) {
    const l = candidatesFor(products, cat, inStockOnly).filter(p => !locked[cat] || p.id === locked[cat]);
    cands[cat] = l.slice().sort((a, b) => a.price - b.price || compareId(a,b));
  }
  const n = SEARCH_ORDER.length, minSuffix = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) minSuffix[i] = minSuffix[i + 1] + (cands[SEARCH_ORDER[i]].length ? moneyCents(cands[SEARCH_ORDER[i]][0].price) : Infinity);
  const space = SEARCH_ORDER.reduce((s, c) => s * cands[c].length, 1);
  const stats = { explored: 0, checks: 0, pruned: 0, prunedBudget: 0, prunedUnknown: 0, solutions: 0, backtracks: 0 };
  const reasons = {}; const trace = []; const sols = []; let stopped = null;
  const b = {};
  const T = (depth, cat, name, kind, msg) => { if (trace.length < traceLimit) trace.push({ depth, cat, catLabel: CAT[cat].label, name, kind, msg }); };
  function rec(i, cost) {
    if (i === n) {
      const sel = {}; SEARCH_ORDER.forEach(c => sel[c] = b[c].id);
      sols.push({ sel, total: cost / 100 }); stats.solutions++;
      T(n - 1, SEARCH_ORDER[n - 1], '', 'solution', `Valid configuration #${stats.solutions} · ${peso(cost / 100)}`);
      if (sols.length >= maxSolutions) { stopped = 'solutions'; return true; }
      return false;
    }
    const cat = SEARCH_ORDER[i];
    for (const p of cands[cat]) {
      if (stats.explored >= maxNodes) { stopped = 'nodes'; return true; }
      stats.explored++;
      const price = moneyCents(p.price);
      if (budgetCents != null && cost + price + minSuffix[i + 1] > budgetCents) {
        stats.pruned++; stats.prunedBudget++; reasons.budget = (reasons.budget || 0) + 1;
        T(i, cat, p.name, 'prune', `Over budget: ≥ ${peso((cost + price + minSuffix[i + 1]) / 100)} with cheapest remaining parts`);
        continue;
      }
      b[cat] = p;
      let fail = null;
      for (const k of CONSTRAINTS) {
        if (!k.cats.includes(cat) || !k.cats.every(c => b[c])) continue;
        stats.checks++;
        const r = k.test(b);
        if (r.s !== 'pass') { fail = { k, r }; break; }
      }
      if (fail) {
        stats.pruned++;
        const key = fail.r.s === 'unknown' ? 'unknown' : fail.k.id;
        if (fail.r.s === 'unknown') stats.prunedUnknown++;
        reasons[key] = (reasons[key] || 0) + 1;
        T(i, cat, p.name, 'prune', (fail.r.s === 'unknown' ? 'Cannot verify: ' : fail.k.short + ': ') + fail.r.m);
        delete b[cat];
        continue;
      }
      T(i, cat, p.name, 'ok', 'Consistent with earlier choices');
      if (rec(i + 1, cost + price)) { delete b[cat]; return true; }
      delete b[cat];
    }
    stats.backtracks++;
    if (i > 0) T(i, cat, '', 'back', `No more ${CAT[cat].label} options on this branch → backtrack to ${CAT[SEARCH_ORDER[i - 1]].label}`);
    return false;
  }
  if (SEARCH_ORDER.every(cat => cands[cat].length)) rec(0, 0);
  const reasonLabels = Object.assign({ budget: 'Over budget', unknown: 'Unverifiable (missing specs)' }, Object.fromEntries(CONSTRAINTS.map(k => [k.id, k.short])));
  const rejections = Object.entries(reasons).map(([k, v]) => ({ key: k, label: reasonLabels[k], count: v })).sort((a, b) => b.count - a.count);
  sols.sort((a, b) => a.total - b.total);
  return { order: SEARCH_ORDER, cands: Object.fromEntries(SEARCH_ORDER.map(c => [c, cands[c].length])), space, stats, rejections, trace, solutions: sols, stopped, maxSolutions, maxNodes, locked, budget };
}

// ---------- DYNAMIC PROGRAMMING: budget optimizer ----------
export const USE_CASES = {
  'Gaming': { cpu: 0.24, gpu: 0.46, ram: 0.12, storage: 0.08, cooler: 0.05, psu: 0.05 },
  'Programming': { cpu: 0.38, gpu: 0.08, ram: 0.28, storage: 0.16, cooler: 0.05, psu: 0.05 },
  'Office Work': { cpu: 0.30, gpu: 0.04, ram: 0.22, storage: 0.24, cooler: 0.10, psu: 0.10 },
  'Content Creation': { cpu: 0.34, gpu: 0.28, ram: 0.22, storage: 0.10, cooler: 0.03, psu: 0.03 }
};
export function weightsFor(useCase, pri) {
  const base = USE_CASES[useCase] || USE_CASES.Gaming; pri = pri || { graphics: 3, processing: 3, memory: 3 };
  const m = { cpu: pri.processing / 3, cooler: pri.processing / 3, gpu: pri.graphics / 3, ram: pri.memory / 3, storage: pri.memory / 3, psu: 1 };
  const w = {}; let s = 0;
  for (const k in base) { w[k] = base[k] * m[k]; s += w[k]; }
  for (const k in w) w[k] = w[k] / s;
  return w;
}
export function compScore(p, cat, useCase) {
  if (!p) return 0; const f = p.perf || {};
  if (cat === 'cpu' || cat === 'gpu') return useCase === 'Gaming' ? (f.gaming ?? 50) : (f.work ?? 50);
  return f.score ?? 50;
}
export function scoreBuild(sel, byId, useCase, w) {
  let s = 0;
  for (const k in w) s += w[k] * compScore(byId[sel[k]], k, useCase);
  return s;
}
export const DP_STAGES = [{ key: 'ram', label: 'Memory', cats: ['ram'] }, { key: 'power', label: 'GPU + PSU', cats: ['gpu', 'psu'] },
  { key: 'cooler', label: 'Cooler', cats: ['cooler'] }, { key: 'storage', label: 'Storage', cats: ['storage'] }];

export function optimizeBuild(o) {
  const { budget, useCase = 'Gaming', lean = false, cpuBrand = 'Any', gpuBrand = 'Any', minRam = 0, excludeOOS = true, unit = 100 } = o;
  const products = algorithmCatalog(o.products);
  const budgetCents = moneyCents(budget, 'Budget'), unitCents = moneyCents(unit, 'Budget unit', false);
  if (budget > 500000 || Math.floor(budgetCents / unitCents) > 20000) throw new RangeError('Optimizer budget/state limit exceeded');
  if (typeof lean !== 'boolean' || typeof excludeOOS !== 'boolean') throw new RangeError('Optimizer flags must be boolean');
  const pri = { graphics: 3, processing: 3, memory: 3, ...o.pri };
  if (!USE_CASES[useCase] || !['Any','AMD','Intel'].includes(cpuBrand) || !['Any','AMD','NVIDIA','Intel'].includes(gpuBrand)
    || ![0,32,64].includes(minRam) || Object.values(pri).some(v => !Number.isInteger(v) || v < 1 || v > 5)) throw new RangeError('Invalid optimizer preferences');
  const w = weightsFor(useCase, pri);
  const okStock = p => !excludeOOS || p.stock > 0;
  const pool = cat => products.filter(p => p.category === cat && okStock(p));
  const cpus = pool('cpu').filter(p => cpuBrand === 'Any' || p.brand === cpuBrand);
  const mbs = pool('motherboard'), cases = pool('case'), coolers = pool('cooler'), psus = pool('psu'), stor = pool('storage');
  const rams = pool('ram').filter(p => (num(p.specs.capacity) || 0) >= (minRam || 0));
  const gpus = pool('gpu').filter(p => gpuBrand === 'Any' || p.specs.chipBrand === gpuBrand);
  const unknownNames = new Set();
  const sc = (p, c) => compScore(p, c, useCase);
  let anchorsTotal = 0, anchorsOver = 0, anchorsInfeasible = 0, anchorsFeasible = 0, states = 0, maxK = 0, minFeasible = Infinity;
  let best = null; const anchorResults = [];
  for (const cpu of cpus) for (const mb of mbs) for (const cs of cases) {
    const b = { cpu, motherboard: mb, case: cs };
    if (!feasible(b)) continue;
    anchorsTotal++;
    const anchorCents = moneyCents(cpu.price) + moneyCents(mb.price) + moneyCents(cs.price), anchorCost = anchorCents / 100;
    const gl = [];
    gl.push(rams.filter(r => feasible({ ...b, ram: r })).map(r => ({ items: { ram: r }, cost: r.price, val: w.ram * sc(r, 'ram') })));
    const pw = [];
    const gList = gpus.concat(gpuBrand === 'Any' && cpu.specs.igpu === 'Yes' ? [IGPU] : []);
    for (const g of gList) {
      if (!g.virtual && num(g.specs.length) == null) { unknownNames.add(g.name); continue; }
      for (const ps of psus) if (feasible({ ...b, gpu: g, psu: ps })) pw.push({ items: { gpu: g, psu: ps }, cost: (moneyCents(g.price) + moneyCents(ps.price)) / 100, val: w.gpu * sc(g, 'gpu') + w.psu * sc(ps, 'psu') });
    }
    gl.push(pw);
    gl.push(coolers.filter(c => feasible({ ...b, cooler: c })).map(c => ({ items: { cooler: c }, cost: c.price, val: w.cooler * sc(c, 'cooler') })));
    gl.push(stor.filter(s => feasible({ ...b, storage: s })).map(s => ({ items: { storage: s }, cost: s.price, val: w.storage * sc(s, 'storage') })));
    if (gl.some(g => !g.length)) { anchorsInfeasible++; continue; }
    const minCost = anchorCents + gl.reduce((s, g) => s + g.reduce((m,x) => Math.min(m,moneyCents(x.cost)),Infinity), 0);
    minFeasible = Math.min(minFeasible, minCost / 100);
    if (minCost > budgetCents) { anchorsOver++; continue; }
    anchorsFeasible++;
    const cap = Math.floor((budgetCents - anchorCents) / unitCents);
    const dp = [new Float64Array(cap + 1)], ch = [];
    let previousCosts = new Float64Array(cap + 1);
    const groups = gl.map(g => g.map(x => ({ ...x, cents: moneyCents(x.cost), u: Math.ceil(moneyCents(x.cost) / unitCents) })));
    for (const g of groups) {
      maxK = Math.max(maxK, g.length);
      const prev = dp[dp.length - 1], cur = new Float64Array(cap + 1).fill(-Infinity), c = new Int32Array(cap + 1).fill(-1);
      const currentCosts = new Float64Array(cap + 1).fill(Infinity);
      for (let x = 0; x <= cap; x++) for (let k = 0; k < g.length; k++) {
        const op = g[k]; if (op.u > x) continue;
        const v = prev[x - op.u] + op.val; states++;
        const cost = previousCosts[x - op.u] + op.cents;
        if (v > cur[x] + EPS || Math.abs(v - cur[x]) <= EPS && cost < currentCosts[x]) { cur[x] = v; c[x] = k; currentCosts[x] = cost; }
      }
      dp.push(cur); ch.push(c);
      previousCosts = currentCosts;
    }
    const anchorScore = w.cpu * sc(cpu, 'cpu');
    const last = dp[dp.length - 1];
    let bx = -1, bobj = -Infinity;
    for (let x = 0; x <= cap; x++) {
      if (last[x] === -Infinity) continue;
      const obj = anchorScore + last[x] - (lean ? 15 * (anchorCents + x * unitCents) / budgetCents : 0);
      if (obj > bobj + EPS || Math.abs(obj - bobj) <= EPS && (bx < 0 || previousCosts[x] < previousCosts[bx])) { bobj = obj; bx = x; }
    }
    if (bx < 0) { anchorsOver++; anchorsFeasible--; continue; }
    // reconstruct
    const path = []; let x = bx;
    for (let i = groups.length - 1; i >= 0; i--) { const k = ch[i][x]; const op = groups[i][k]; path.unshift({ stage: i, x, k, op }); x -= op.u; }
    const sel = { cpu: cpu.id, motherboard: mb.id, case: cs.id };
    path.forEach(st => Object.entries(st.op.items).forEach(([c, p]) => sel[c] = p.id));
    const total = (anchorCents + path.reduce((s, st) => s + st.op.cents, 0)) / 100;
    const score = anchorScore + last[bx];
    const ar = { sel, cpu, mb, cs, anchorCost, total, score, objective: bobj };
    anchorResults.push(ar);
    if (!best || bobj > best.ar.objective + 1e-9 || (Math.abs(bobj - best.ar.objective) < 1e-9 && total < best.ar.total)) best = { ar, dp, ch, groups, path, cap, bx, anchorScore };
  }
  const exclusions = { oos: excludeOOS ? products.filter(p => p.stock <= 0).length : 0, unknown: [...unknownNames] };
  if (!best) return { ok: false, budget, useCase, w, minFeasible: isFinite(minFeasible) ? minFeasible : null, anchorsTotal, anchorsInfeasible, exclusions };
  const byId = indexProducts(products);
  const sel = best.ar.sel;
  const items = CATEGORIES.map(c => { const p = byId[sel[c.key]]; const wt = w[c.key] || 0; const s = wt ? sc(p, c.key) : null;
    return { cat: c.key, label: c.label, product: p, price: p.price, weight: wt, score: s, contrib: wt * (s || 0) }; });
  const nCols = 6, cols = new Set();
  for (let j = 0; j < nCols; j++) cols.add(Math.round(best.cap * j / (nCols - 1)));
  // x at stage i (after i groups)
  const stageX = []; stageX[best.groups.length] = best.bx;
  for (let i = best.groups.length - 1; i >= 0; i--) stageX[i] = stageX[i + 1] - best.path[i].op.u;
  stageX.forEach(x => cols.add(x));
  const colList = [...cols].filter(x => x >= 0 && x <= best.cap).sort((a, b) => a - b);
  const table = {
    cols: colList.map(x => ({ x, pesos: x * unit })),
    rows: best.dp.map((row, i) => ({ label: i === 0 ? 'Start (no parts)' : 'After ' + DP_STAGES[i - 1].label, cells: colList.map(x => ({ x, v: row[x], onPath: stageX[i] === x })) }))
  };
  const transitions = best.path.map((st, i) => ({ stage: DP_STAGES[i].label, choice: Object.values(st.op.items).map(p => p.name).join(' + '),
    cost: st.op.cost, value: st.op.val, options: best.groups[i].length }));
  const topAnchors = anchorResults.slice().sort((a, b) => Math.abs(b.objective-a.objective)>EPS ? b.objective-a.objective
    : a.total-b.total || compareId(a.cpu,b.cpu) || compareId(a.mb,b.mb) || compareId(a.cs,b.cs))
    .slice(0, 6).map(a => ({ cpu: a.cpu.name, mb: a.mb.name, cs: a.cs.name, anchorCost: a.anchorCost, total: a.total, score: a.score, sel: a.sel }));
  return {
    ok: true, budget, useCase, w, lean, sel, items, total: best.ar.total, score: best.ar.score, remaining: budget - best.ar.total,
    anchorCost: best.ar.anchorCost, anchorScore: best.anchorScore, subBudget: budget - best.ar.anchorCost, cap: best.cap, unit,
    anchorsTotal, anchorsFeasible, anchorsOver, anchorsInfeasible, states, maxK, minFeasible, table, transitions, topAnchors, exclusions,
    stageSizes: best.groups.map(g => g.length)
  };
}

// ---------- GREEDY: restock optimizer ----------
export function restockPlan(products, budget, coverDays = 7) {
  const real = algorithmCatalog(products, true), budgetCents = moneyCents(budget, 'Budget');
  if (![7,14,30].includes(coverDays)) throw new RangeError('Coverage must be 7, 14 or 30 days');
  for (const p of real) {
    whole(p.minStock,'Minimum stock'); whole(p.leadTime,'Lead time',1); whole(p.moq ?? 1,'Minimum order',1);
    if (typeof (p.dailySales ?? 0) !== 'number' || !Number.isFinite(p.dailySales ?? 0) || (p.dailySales ?? 0) < 0) throw new RangeError('Daily sales must be finite and non-negative');
  }
  const maxDaily = real.reduce((m,p) => Math.max(m,p.dailySales ?? 0),0.1);
  const rows = real.map(p => {
    const daily = p.dailySales || 0;
    const dts = daily > 0 ? p.stock / daily : Infinity;
    const rop = Math.ceil(daily * p.leadTime + p.minStock);
    const target = Math.ceil(p.minStock + daily * (p.leadTime + coverDays));
    const need = Math.max(0, target - p.stock);
    const moq = Math.max(1, p.moq || 1);
    const qty = Math.max(moq, need);
    whole(target,'Restock target'); whole(qty,'Recommended quantity',1);
    const costCents = qty * moneyCents(p.cost);
    if (!Number.isSafeInteger(costCents) || costCents > Number.MAX_SAFE_INTEGER / 32) throw new RangeError('Restock order value exceeds safe limits');
    const leadRatio = p.leadTime / Math.max(isFinite(dts) ? dts : 1e9, 0.5);
    const urgency = Math.round(100 * (0.6 * Math.min(leadRatio, 3) / 3 + 0.4 * daily / maxDaily));
    let reason;
    if (p.stock <= 0) reason = `Out of stock; ${p.leadTime}-day lead time means lost sales until delivery`;
    else if (dts < p.leadTime) reason = `Runs out in ~${dts.toFixed(1)} days, before a ${p.leadTime}-day order could arrive`;
    else if (p.stock <= p.minStock) reason = `At or below minimum stock (${p.stock}/${p.minStock})`;
    else reason = `Will reach reorder point (${rop} units) within the lead time`;
    return { p, id: p.id, name: p.name, category: p.category, stock: p.stock, minStock: p.minStock, daily, lead: p.leadTime, moq, unitCost: p.cost,
      dts, rop, target, need, qty, cost: costCents / 100, leadRatio, urgency, reason, candidate: p.stock <= rop && daily > 0 };
  });
  const cands = rows.filter(r => r.candidate).sort((a, b) => b.urgency - a.urgency || b.daily - a.daily || compareId(a,b));
  let remainingCents = budgetCents, remaining = budget; const steps = []; const selected = []; const skipped = [];
  cands.forEach((r, i) => {
    r.rank = i + 1;
    const before = remaining;
    if (moneyCents(r.cost) <= remainingCents) {
      remainingCents -= moneyCents(r.cost); remaining = remainingCents / 100; r.decision = 'selected'; r.orderQty = r.qty; r.orderCost = r.cost; selected.push(r);
      steps.push({ rank: r.rank, r, before, after: remaining, decision: 'selected', note: `Ordered ${r.qty} × ${peso(r.unitCost)}` });
    } else {
      const maxQ = Math.floor(remainingCents / moneyCents(r.unitCost));
      if (maxQ >= r.moq && maxQ > 0) {
        r.decision = 'partial'; r.orderQty = maxQ; r.orderCost = maxQ * moneyCents(r.unitCost) / 100;
        remainingCents -= maxQ * moneyCents(r.unitCost); remaining = remainingCents / 100; selected.push(r);
        steps.push({ rank: r.rank, r, before, after: remaining, decision: 'partial', note: `Reduced to ${maxQ} of ${r.qty} units to fit remaining budget` });
      } else {
        r.decision = 'skipped'; r.orderQty = 0; r.orderCost = 0;
        r.skipReason = r.moq * r.unitCost > remaining
          ? `Minimum order of ${r.moq} units costs ${peso(r.moq * r.unitCost)}; only ${peso(remaining)} left`
          : `Cannot afford any units with ${peso(remaining)} left`;
        skipped.push(r);
        steps.push({ rank: r.rank, r, before, after: remaining, decision: 'skipped', note: r.skipReason });
      }
    }
  });
  const totalCost = (budgetCents - remainingCents) / 100;
  const greedyValue = selected.reduce((s, r) => s + r.urgency * (r.orderQty / r.qty), 0);
  // Exact only within this conservative rounded-cost, full-order reference domain.
  const U = 10000, capU = Math.floor(budgetCents / U);
  let ks = null;
  if (cands.length && capU <= 20000 && cands.length * (capU + 1) <= 2_000_000) {
    const dp = new Float64Array(capU + 1); const take = cands.map(() => new Uint8Array(capU + 1));
    cands.forEach((r, i) => { const c = Math.ceil(moneyCents(r.cost) / U); for (let x = capU; x >= c; x--) { const v = dp[x - c] + r.urgency; if (v > dp[x]) { dp[x] = v; take[i][x] = 1; } } });
    let x = capU; const picks = [];
    for (let i = cands.length - 1; i >= 0; i--) if (take[i][x]) { picks.push(cands[i]); x -= Math.ceil(moneyCents(cands[i].cost) / U); }
    ks = { value: dp[capU], count: picks.length, names: picks.map(r => r.name), cost: picks.reduce((s, r) => s + moneyCents(r.cost), 0) / 100 };
  }
  return { budget, coverDays, rows, cands, steps, selected, skipped, remaining, totalCost, notNeeded: rows.length - cands.length,
    greedyValue, knapsack: ks, partialCount: selected.filter(r => r.decision === 'partial').length, maxDaily };
}
