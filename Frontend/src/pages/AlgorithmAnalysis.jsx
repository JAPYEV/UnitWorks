import React, { useMemo } from 'react';
import * as U from '@shared/uw-core.js';
import { Icon, usePageState, mono, card, Spinner, ErrorBox, traceIndent } from '../components/ui.jsx';
import { buildsApi, optimizerApi, restockApi } from '../services/api.js';
import { useAsync } from '../hooks/useAsync.js';

const TABS = [
  { key: 'bt', label: 'Backtracking', sub: 'PC Builder compatibility search', icon: 'git-branch' },
  { key: 'dp', label: 'Dynamic Programming', sub: 'Build Optimizer budget allocation', icon: 'table-2' },
  { key: 'gr', label: 'Greedy', sub: 'Restock Optimizer prioritization', icon: 'list-ordered' }
];
const MK = { ok: ['›', '#A3E635', '#E6E9ED'], prune: ['×', '#F2545B', '#C99A9D'], back: ['↰', '#7D8692', '#7D8692'], solution: ['✓', '#3FCF8E', '#3FCF8E'] };
const DEC = { selected: '#3FCF8E', partial: '#A3E635', skipped: '#F5B83D' };
const INIT = { tab: 'bt', btCpu: 'none', btBudget: '120000', dpUse: 'Gaming', dpBudget: '70000', grBudget: '600000' };
const opts = pairs => pairs.map(([value, label]) => ({ value, label }));

/* Table cell / column / section builders, mirroring the design's data model. */
const C = (text, o = {}) => ({ text: String(text), align: o.align || 'left', color: o.color || '#C3C9D0', font: o.mono ? mono : 'inherit', ws: o.wrap ? 'normal' : 'nowrap' });
const col = (label, align) => ({ label, align: align || 'left' });
const row = cells => ({ bg: 'transparent', cells });
const sec = o => ({ span: o.full ? '1 / -1' : 'auto', sub: '', maxH: 'none', minW: '0', ...o });

const measured = (ms, what) => sec({ title: 'Empirical measurement', sub: 'This run only',
  stats: [{ label: 'Server time', value: `${ms} ms`, note: what, color: '#E6E9ED' }],
  note: 'Wall-clock time for one execution on the API server, which depends on hardware and load. It illustrates scale only; the theoretical complexity below is derived from the code, not from this number.' });

export function backtrackingView(products, byId, s, set, r) {
  const budget = s.btBudget === 'none' ? null : +s.btBudget;
  const intro = { title: 'Sample run: constraint-satisfaction search over the current catalog', text: 'Counts below come from running the backtracking routine on the server against current inventory. They are operation counts from this run, not timing benchmarks.' };
  const controls = [
    { label: 'Locked CPU', value: s.btCpu, onChange: e => set({ btCpu: e.target.value }), options: [{ value: 'none', label: 'None (search all CPUs)' }, ...products.filter(p => p.category === 'cpu').map(p => ({ value: p.id, label: p.name }))] },
    { label: 'Budget', value: s.btBudget, onChange: e => set({ btBudget: e.target.value }), options: opts([['none', 'No budget'], ['60000', '₱60,000'], ['90000', '₱90,000'], ['120000', '₱120,000']]) }
  ];
  if (!r) return { intro, controls, sections: [] };
  const rej = Object.fromEntries(r.rejections.map(x => [x.key, x.count]));
  const rejCell = (n, warn) => C(n || 0, { mono: true, align: 'right', color: n ? (warn ? '#F5B83D' : '#F2545B') : '#6B7480' });
  const name = id => (byId[id] || { name: id }).name;
  return {
    intro, controls,
    sections: [
      sec({ title: 'Input configuration', sub: 'Variables, domains, and ordering', cols: [col('#'), col('Category'), col('Domain', 'right'), col('Candidates')],
        rows: U.SEARCH_ORDER.map((c, i) => row([C(i + 1, { mono: true, color: '#7D8692' }), C(U.CAT[c].label), C(r.cands[c], { mono: true, align: 'right' }),
          C(c === 'cpu' && r.locked.cpu ? 'Locked: ' + name(r.locked.cpu) : c === 'gpu' ? 'Includes integrated graphics option' : 'All catalog items, cheapest first', { wrap: true, color: '#9AA3AE' })])),
        note: `Budget: ${budget ? U.peso(budget) : 'none'}. Unpruned search space: ${r.space.toLocaleString()} complete combinations (product of domain sizes).` }),
      sec({ title: 'Search result', sub: r.stopped === 'solutions' ? `Stopped after ${r.maxSolutions} valid builds` : r.stopped === 'nodes' ? `Stopped at the ${r.maxNodes.toLocaleString()}-node cap` : 'Exhaustive for this input',
        stats: [
          { label: 'Candidates explored', value: r.stats.explored, note: 'partial assignments', color: '#E6E9ED' }, { label: 'Constraint checks', value: r.stats.checks, note: 'rule evaluations', color: '#E6E9ED' },
          { label: 'Branches pruned', value: r.stats.pruned, note: `${r.stats.prunedBudget} by budget bound`, color: '#F2545B' }, { label: 'Valid configurations', value: r.solutions.length, note: `${r.stats.backtracks} backtracks`, color: '#3FCF8E' }],
        text: [`Explored ${r.stats.explored.toLocaleString()} partial assignments instead of enumerating ${r.space.toLocaleString()} complete builds. Each pruned node removes its entire subtree, which is why the explored count stays small.`] }),
      sec({ title: 'Constraints checked', sub: 'Evaluated as soon as all involved parts are assigned', full: true, minW: '720px',
        cols: [col('Constraint'), col('Rule'), col('Parts'), col('Rejected', 'right')],
        rows: [
          ...U.CONSTRAINTS.map(k => ({ bg: rej[k.id] ? 'rgba(242,84,91,0.04)' : 'transparent', cells: [C(k.label, { color: '#E6E9ED' }), C(k.rule, { mono: true, color: '#9AA3AE' }), C(k.cats.map(c => U.CAT[c].label).join(' + '), { color: '#9AA3AE' }), rejCell(rej[k.id])] })),
          row([C('Budget bound'), C('cost + cheapest remaining ≤ budget', { mono: true, color: '#9AA3AE' }), C('All', { color: '#9AA3AE' }), rejCell(rej.budget)]),
          row([C('Missing specification'), C('unknown value → branch rejected', { mono: true, color: '#9AA3AE' }), C('Any', { color: '#9AA3AE' }), rejCell(rej.unknown, true)])
        ] }),
      sec({ title: 'Example search trace', sub: `First ${r.trace.length} events`, trace: r.trace }),
      sec({ title: 'Valid configurations found', sub: 'Found results sorted by price; capped search is not globally cheapest-K', cols: [col('#'), col('Parts'), col('Total', 'right')],
        rows: r.solutions.slice(0, 6).map((x, i) => row([C(i + 1, { mono: true, color: '#7D8692' }), C(U.SEARCH_ORDER.map(c => name(x.sel[c])).join(' · '), { wrap: true }), C(U.peso(x.total), { mono: true, align: 'right' })])),
        note: r.solutions.length ? '' : r.stopped ? 'No verified build found before the search limit.' : 'No fully verified compatible configuration exists for this input.' }),
      measured(r.durationMs, 'backtracking search incl. trace'),
      sec({ title: 'Time and space complexity', sub: 'Derived from the implementation', full: true,
        formula: [
          'Let nᵢ = candidates in category i (8 categories), C = 11 constraints.',
          `Search       O( C · Σ_d Π_{i≤d} nᵢ ); nonempty domains: O(8 · C · Π nᵢ)`,
          'Preparation  O(N log N) for catalog/candidate ordering; N = inventory size',
          `This run     ${r.stats.explored.toLocaleString()} nodes, ${r.stats.checks.toLocaleString()} constraint checks`,
          'Space        O(N + 8 + 8S + T), including catalog/candidates, depth, solutions and trace'
        ],
        text: ['Without pruning the search grows with the product of the candidate counts, i.e. exponentially in the number of categories. Checking each constraint at the earliest level where its parts are known, and bounding by budget with the cheapest remaining parts, removes whole subtrees, but the worst case is unchanged. The search stops after S solutions or 40,000 nodes, so results are complete only when the summary says “Exhaustive for this input”.'] })
    ]
  };
}

export function dpView(s, set, r) {
  const budget = +s.dpBudget;
  const base = {
    intro: { title: 'Sample run: category-based multiple-choice optimization', text: 'In-stock parts only, balanced priorities, computed on the server from current inventory. Component scores are illustrative indices, not benchmarks.' },
    controls: [
      { label: 'Intended use', value: s.dpUse, onChange: e => set({ dpUse: e.target.value }), options: Object.keys(U.USE_CASES).map(k => ({ value: k, label: k })) },
      { label: 'Budget', value: s.dpBudget, onChange: e => set({ dpBudget: e.target.value }), options: opts([['40000', '₱40,000'], ['70000', '₱70,000'], ['100000', '₱100,000'], ['150000', '₱150,000']]) }
    ]
  };
  if (!r) return { ...base, sections: [] };
  if (!r.ok) return { ...base, sections: [sec({ title: 'No build returned', full: true, text: [r.minFeasible == null
    ? 'No fully verified combination satisfies the stock, compatibility and preference filters.'
    : r.minFeasible > budget ? `The cheapest verified combination costs ${U.peso(r.minFeasible)}, above the ${U.peso(budget)} budget.`
      : `A verified combination can cost ${U.peso(r.minFeasible)}, but the conservative rounded group costs do not fit ${U.peso(budget)}. Increase the budget or relax a preference.`] })] };
  const w = r.w, fmtV = v => (v === null || v === -Infinity ? '—' : v.toFixed(1));
  return { ...base, sections: [
    sec({ title: 'Budget and component categories', sub: `${U.peso(budget)} · ${s.dpUse}`, cols: [col('Stage'), col('Categories'), col('Options', 'right')],
      rows: [row([C('Platform'), C('CPU + Motherboard + Case'), C(`${r.anchorsTotal} combos`, { mono: true, align: 'right' })]),
        ...U.DP_STAGES.map((st, i) => row([C('Group ' + (i + 1)), C(st.cats.map(c => U.CAT[c].label).join(' + ')), C(r.stageSizes[i], { mono: true, align: 'right' })]))],
      note: 'Option counts are for the winning platform after compatibility filtering. GPU and PSU are paired because PSU validity depends on the GPU.' }),
    sec({ title: 'Optimization objective', formula: ['maximize   S = Σ_c w_c · s_c', `subject to Σ price ≤ ${U.peso(budget)}`, '           one part per category', '           all compatibility rules pass', 'D[i][b] = max_k ( D[i−1][b − cost_k] + value_k )'],
      text: [`Budget is discretized in ₱${r.unit} steps with costs rounded up, so ${r.cap + 1} budget states exist per group for the winning platform.`,
        `The platform uses exact cent prices; each remaining group (including the combined GPU+PSU price) rounds up to ₱${r.unit}. DP maximizes the additive score in this conservative domain. When prices align with the step, rounding adds no cost and the score optimum is exact. Otherwise a valid build can be missed; rounding adds less than four steps per build and never permits overspending. Equal objective values prefer lower actual cost, then deterministic ID-ordered traversal.`] }),
    sec({ title: 'Scoring model', sub: s.dpUse + ' weights (balanced priorities)', cols: [col('Category'), col('Weight', 'right'), col('Score source')],
      rows: U.CATEGORIES.map(c => row([C(c.label), C(Math.round((w[c.key] || 0) * 100) + '%', { mono: true, align: 'right' }),
        C(!w[c.key] ? 'No score; constrains other parts' : c.key === 'cpu' || c.key === 'gpu' ? (s.dpUse === 'Gaming' ? 'Gaming index' : 'Multi-thread / compute index') : 'Category quality index', { color: '#9AA3AE' })])) }),
    sec({ title: 'Recommended configuration', sub: `${U.peso(r.total)} · score ${r.score.toFixed(1)} · ${U.peso(r.remaining)} left`, cols: [col('Category'), col('Component'), col('Points', 'right'), col('Price', 'right')],
      rows: r.items.map(it => row([C(it.label, { color: '#9AA3AE' }), C(it.product.name, { wrap: true, color: '#E6E9ED' }), C(it.weight ? it.contrib.toFixed(1) : '—', { mono: true, align: 'right' }), C(U.peso(it.price), { mono: true, align: 'right' })])) }),
    sec({ title: 'DP state table (winning platform)', sub: 'Highlighted cells are the chosen path', full: true, minW: '640px',
      cols: [col('D[i][b]'), ...r.table.cols.map(c => col(U.pesoShort(c.pesos), 'right'))],
      rows: r.table.rows.map(tr => row([C(tr.label, { color: '#C3C9D0' }), ...tr.cells.map(c => ({ ...C(fmtV(c.v), { mono: true, align: 'right', color: c.onPath ? '#A3E635' : c.v === null ? '#4A525D' : '#9AA3AE' }), text: c.onPath ? '● ' + fmtV(c.v) : fmtV(c.v) }))])),
      note: 'Values are points contributed by the groups so far; the platform adds ' + r.anchorScore.toFixed(1) + ' points for the CPU.' }),
    measured(r.durationMs, 'recommendation + 3 alternatives'),
    sec({ title: 'Time and space complexity', sub: 'Derived from the implementation', full: true,
      formula: [
        'Platforms  O( n_cpu · n_mb · n_case · C )   enumerate and check CPU + board + case',
        'Groups     O( P · (Σ nᵢ + n_gpu · n_psu) · C )   build compatible options per platform',
        'DP         O( P · G · B · K )',
        `           P = ${r.anchorsTotal} platforms, G = 4 groups, B ≤ floor(budget/unit)+1, K ≤ ${r.maxK}`,
        `           Winning platform: ${r.cap + 1} states per group (not necessarily the largest platform table)`,
        `           this run: ${r.states.toLocaleString()} transitions`,
        'Space      O( N + G·B + G·K + P ), including candidates, tables, options and platform results'
      ],
      text: ['Pseudo-polynomial: B grows with budget/unit. Catalog preparation adds O(N log N). The core rejects budgets over ₱500,000 or more than 20,001 budget states before table allocation. Scores are additive; CPU bottlenecks and real performance interactions are not modeled. The “prefer unspent budget” option maximizes score minus 15 × rounded spend/budget, rather than pure score. Choice reconstruction uses 32-bit indices.'] })
  ] };
}

export function greedyView(s, set, r) {
  const budget = +s.grBudget;
  const intro = { title: 'Sample run: urgency-ordered replenishment', text: 'Computed on the server from current inventory, a 7-day coverage target, and the selected budget. Demand uses each product’s stored average daily sales.' };
  const controls = [{ label: 'Purchasing budget', value: s.grBudget, onChange: e => set({ grBudget: e.target.value }), options: opts([['300000', '₱300,000'], ['600000', '₱600,000'], ['1000000', '₱1,000,000']]) }];
  if (!r) return { intro, controls, sections: [] };
  const ks = r.knapsack;
  return {
    intro, controls,
    sections: [
      sec({ title: 'Inventory inputs', sub: `${r.cands.length} products at or below reorder point · ${r.notNeeded} not needed`, full: true, minW: '760px', maxH: '360px',
        cols: [col('Product'), col('Stock', 'right'), col('Min', 'right'), col('Sales/day', 'right'), col('Lead', 'right'), col('Unit cost', 'right'), col('MOQ', 'right'), col('Order qty', 'right')],
        rows: r.cands.map(x => row([C(x.name, { color: '#E6E9ED' }), C(x.stock, { mono: true, align: 'right', color: x.stock <= 0 ? '#F2545B' : '#C3C9D0' }), C(x.minStock, { mono: true, align: 'right' }), C(x.daily.toFixed(2), { mono: true, align: 'right' }),
          C(x.lead + 'd', { mono: true, align: 'right' }), C(U.peso(x.unitCost), { mono: true, align: 'right' }), C(x.moq, { mono: true, align: 'right' }), C(x.qty, { mono: true, align: 'right' })])) }),
      sec({ title: 'Priority rule', formula: ['urgency = round(100 × ( 0.6 × min(lead ÷ days_left, 3) ÷ 3', '                       + 0.4 × daily ÷ max_daily ))', 'days_left = stock ÷ daily   (floored at 0.5 day)', 'candidate: stock ≤ ⌈daily × lead + min⌉ and daily > 0', 'sort by urgency desc, daily sales desc, then product ID asc'],
        text: ['Lead time divided by days left exceeds 1 when stock will run out before a new order can arrive. Demand is added so fast sellers rank above slow ones at similar risk.'] }),
      sec({ title: 'Purchasing budget allocation', sub: U.peso(budget), stats: [
        { label: 'Selected', value: r.selected.length, note: `${r.partialCount} partial`, color: '#3FCF8E' }, { label: 'Spent', value: U.pesoShort(r.totalCost), note: Math.round(r.totalCost / budget * 100) + '% of budget', color: '#E6E9ED' },
        { label: 'Remaining', value: U.pesoShort(r.remaining), note: 'unallocated', color: '#A3E635' }, { label: 'Skipped', value: r.skipped.length, note: 'could not afford', color: '#F5B83D' }] }),
      sec({ title: 'Ranked candidates and selection sequence', sub: 'One greedy decision per row', full: true, minW: '820px', maxH: '440px',
        cols: [col('Rank'), col('Product'), col('Urgency', 'right'), col('Order cost', 'right'), col('Budget before', 'right'), col('Budget after', 'right'), col('Decision')],
        rows: r.steps.map(st => row([C(st.rank, { mono: true, color: '#7D8692' }), C(st.r.name, { color: '#E6E9ED' }), C(st.r.urgency, { mono: true, align: 'right' }), C(U.peso(st.decision === 'skipped' ? st.r.cost : st.r.orderCost), { mono: true, align: 'right' }),
          C(U.peso(st.before), { mono: true, align: 'right', color: '#9AA3AE' }), C(U.peso(st.after), { mono: true, align: 'right' }),
          C(st.decision === 'partial' ? `Partial (${st.r.orderQty}/${st.r.qty})` : st.decision[0].toUpperCase() + st.decision.slice(1), { color: DEC[st.decision] })])) }),
      sec({ title: 'Skipped products and explanations', cols: [col('Product'), col('Reason')],
        rows: r.skipped.slice(0, 12).map(x => row([C(x.name, { color: '#E6E9ED' }), C(x.skipReason, { wrap: true, color: '#AEB5BE' })])),
        note: r.skipped.length > 12 ? `${r.skipped.length - 12} more skipped.` : r.skipped.length ? '' : 'Nothing was skipped at this budget.' }),
      measured(r.durationMs, 'greedy plan + knapsack reference'),
      sec({ title: 'Complexity and optimality', formula: ['Greedy      O(N log N + n log n) ordering + O(N) scan, O(N) space', `            N = inventory size; n = ${r.candidateCount ?? r.cands.length} reorder candidates`, 'Reference   O(n · H) time and space, H = floor(budget/100)+1'],
        text: ['Greedy is not guaranteed to be globally optimal. It never reconsiders an earlier purchase, so one expensive urgent order can block several cheaper urgent ones.',
          'MOQ is a minimum quantity, not a pack multiple. Zero/missing demand is not a reorder candidate. Money is allocated in integer cents. Invalid quantities/costs are rejected. The optional reference is omitted above 20,001 states or 2,000,000 candidate-state cells; the greedy plan still runs.',
          ks ? `Calculated comparison at ${U.peso(budget)}: greedy covers total urgency ${Math.round(r.greedyValue)} (partial orders counted proportionally); a 0/1 knapsack over full orders with costs rounded up to ₱100 reaches ${Math.round(ks.value)} by funding ${ks.count} products. The two objectives differ slightly, so this is a reference, not a strict optimality gap.` : ''].filter(Boolean) })
    ]
  };
}

export default function AlgorithmAnalysis({ products = [], dataVersion = 0 }) {
  const [s, set] = usePageState('AlgorithmAnalysis', INIT);
  const byId = useMemo(() => U.indexProducts(products), [products]);
  // Each tab runs the real algorithm on the server (same endpoints the other pages use).
  const bt = useAsync(() => buildsApi.search({ locked: s.btCpu === 'none' ? {} : { cpu: s.btCpu }, budget: s.btBudget === 'none' ? undefined : +s.btBudget, maxSolutions: 12, traceLimit: 220 }),
    [s.btCpu, s.btBudget, dataVersion], { enabled: s.tab === 'bt' });
  const dp = useAsync(() => optimizerApi.recommend({ budget: +s.dpBudget, useCase: s.dpUse, pri: { graphics: 3, processing: 3, memory: 3 }, excludeOOS: true })
    .then(out => ({ ...out.rec, durationMs: out.durationMs })), [s.dpUse, s.dpBudget, dataVersion], { enabled: s.tab === 'dp' });
  const gr = useAsync(() => restockApi.recommend({ budget: +s.grBudget, coverDays: 7 }), [s.grBudget, dataVersion], { enabled: s.tab === 'gr' });
  const q = s.tab === 'bt' ? bt : s.tab === 'dp' ? dp : gr;
  const ready = !q.loading && !q.error ? q.data : null;
  const { intro, controls, sections } = s.tab === 'bt' ? backtrackingView(products, byId, s, set, ready) : s.tab === 'dp' ? dpView(s, set, ready) : greedyView(s, set, ready);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'uwin .2s ease-out' }}>
      <div role="tablist" aria-label="Algorithms" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 8 }}>
        {TABS.map(t => { const on = s.tab === t.key;
          return (
            <button key={t.key} role="tab" aria-selected={on} onClick={() => set({ tab: t.key })} style={{ padding: '12px 14px', borderRadius: 8, border: `1px solid ${on ? 'rgba(163,230,53,0.5)' : '#2A313B'}`, background: on ? 'rgba(163,230,53,0.06)' : '#1C2129', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 34, height: 34, borderRadius: 7, display: 'grid', placeItems: 'center', background: '#232932', color: on ? '#A3E635' : '#9AA3AE', flexShrink: 0 }}><Icon name={t.icon} size={17} /></span>
              <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{t.label}</span><span style={{ display: 'block', fontSize: 12, color: '#9AA3AE' }}>{t.sub}</span></span>
            </button>
          ); })}
      </div>

      <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', padding: '14px 16px' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{intro.title}</div>
          <div style={{ fontSize: 12, color: '#9AA3AE', lineHeight: 1.5, marginTop: 2 }}>{intro.text}</div>
        </div>
        {controls.map(c => (
          <label key={c.label} style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#9AA3AE' }}>{c.label}
            <select value={c.value} onChange={c.onChange} style={{ height: 36, border: '1px solid #333B46', borderRadius: 6, background: '#14181E', padding: '0 8px', fontSize: 13, maxWidth: 240 }}>
              {c.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: 16, alignItems: 'start' }}>
        {sections.map(x => <Section key={x.title} s={x} />)}
      </div>
      {q.loading && <Spinner label="Running the algorithm on the server…" />}
      {q.error && <ErrorBox title="Couldn’t run this analysis" error={q.error} onRetry={q.reload} />}
    </div>
  );
}

function Section({ s }) {
  return (
    <section style={{ ...card, gridColumn: s.span, padding: '16px 18px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{s.title}</h2>
        <span style={{ fontSize: 11.5, color: '#7D8692' }}>{s.sub}</span>
      </div>
      {s.text && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {s.text.map((p, i) => <p key={i} style={{ margin: 0, fontSize: 12.5, color: '#AEB5BE', lineHeight: 1.6, textWrap: 'pretty' }}>{p}</p>)}
        </div>
      )}
      {s.formula && (
        <div style={{ padding: '10px 12px', borderRadius: 6, background: '#12161B', border: '1px solid #262C35', fontFamily: mono, fontSize: 12, color: '#C3C9D0', lineHeight: 1.75, overflowX: 'auto' }}>
          {s.formula.map((l, i) => <div key={i} style={{ whiteSpace: 'pre' }}>{l}</div>)}
        </div>
      )}
      {s.stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
          {s.stats.map(k => (
            <div key={k.label} style={{ padding: '10px 12px', borderRadius: 7, background: '#171B21', border: '1px solid #262C35' }}>
              <div style={{ fontSize: 11.5, color: '#9AA3AE' }}>{k.label}</div>
              <div style={{ fontFamily: mono, fontSize: 18, marginTop: 3, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 10.5, color: '#6B7480', marginTop: 2 }}>{k.note}</div>
            </div>
          ))}
        </div>
      )}
      {s.rows && (
        <div style={{ overflowX: 'auto', maxHeight: s.maxH, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: s.minW }}>
            <thead><tr>
              {s.cols.map((c, i) => <th key={i} style={{ padding: '7px 8px', textAlign: c.align, fontFamily: mono, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6B7480', fontWeight: 500, position: 'sticky', top: 0, background: '#1C2129', whiteSpace: 'nowrap' }}>{c.label}</th>)}
            </tr></thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid #262C35', background: r.bg }}>
                  {r.cells.map((c, j) => <td key={j} style={{ padding: '7px 8px', textAlign: c.align, color: c.color, fontFamily: c.font, whiteSpace: c.ws, lineHeight: 1.45 }}>{c.text}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.trace && (
        <div style={{ background: '#12161B', border: '1px solid #262C35', borderRadius: 7, padding: '8px 0', maxHeight: 420, overflow: 'auto', fontFamily: mono, fontSize: 11.5, lineHeight: 1.5 }}>
          {s.trace.map((t, i) => {
            const [mark, color, textColor] = MK[t.kind];
            return (
              <div key={i} style={{ display: 'flex', gap: 8, padding: `2px 12px 2px ${12 + t.depth * traceIndent()}px`, alignItems: 'baseline' }}>
                <span style={{ color, width: 12, flexShrink: 0 }}>{mark}</span>
                <span style={{ color: '#7D8692', flexShrink: 0 }}>{t.kind === 'solution' ? 'DONE' : t.catLabel.toUpperCase()}</span>
                <span style={{ color: textColor }}>{t.name ? `${t.name} — ${t.msg}` : t.msg}</span>
              </div>
            );
          })}
        </div>
      )}
      {s.note && <div style={{ fontSize: 11.5, color: '#6B7480', lineHeight: 1.5 }}>{s.note}</div>}
    </section>
  );
}
