import React from 'react';
import * as U from '@shared/uw-core.js';
import { Icon, usePageState, mono, card } from '../components/ui.jsx';
import { optimizerApi } from '../services/api.js';
import { usePending } from '../hooks/useAsync.js';

const USES = [{ label: 'Gaming', icon: 'gamepad-2' }, { label: 'Programming', icon: 'code' }, { label: 'Office Work', icon: 'briefcase' }, { label: 'Content Creation', icon: 'clapperboard' }];
const PRESETS = [35000, 50000, 70000, 100000, 150000];
const PRI_TEXT = ['', 'Low', 'Below avg', 'Balanced', 'High', 'Max'];
const ALLOC = { cpu: '#A3E635', motherboard: '#6F8F3E', ram: '#6E9BC4', gpu: '#C9A54C', cooler: '#5D7C8F', psu: '#9480BC', storage: '#5FA89A', case: '#7D8692' };
const SRC = { cpu: ['Gaming performance index', 'Multi-thread index'], gpu: ['Gaming performance index', 'Compute / creator index'], ram: 'Capacity and speed', storage: 'Interface and capacity', cooler: 'Cooling headroom', psu: 'Efficiency and capacity' };
const INIT = { budget: '70000', useCase: 'Gaming', pri: { graphics: 3, processing: 3, memory: 3 }, cpuBrand: 'Any', gpuBrand: 'Any', minRam: '0', excludeOOS: true, lean: false,
  run: null, result: null, running: false, touched: false, view: 0, dpOpen: true };
const legend = { fontSize: 12.5, color: '#C3C9D0', fontWeight: 500, padding: 0 };
const fieldset = { border: 'none', margin: 0, padding: 0 };
const th = { padding: '10px 8px', fontWeight: 500 };
const theadRow = { textAlign: 'left', fontFamily: mono, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6B7480' };
const subhead = { fontSize: 12, fontWeight: 600, color: '#E6E9ED' };
const parseBudget = s => +s.replace(/[,₱\s]/g, '');

function budgetCheck(raw) {
  const r = raw.replace(/[,₱\s]/g, ''), n = +r;
  if (!r) return 'Enter a budget.';
  if (!isFinite(n) || !Number.isInteger(n)) return 'Use a whole peso amount, e.g. 70000.';
  if (n < 15000) return 'Minimum budget is ₱15,000.';
  if (n > 500000) return 'Maximum budget for this prototype is ₱500,000.';
  return null;
}

export default function BuildOptimizer({ products = [], api = {}, vw = 1280 }) {
  const [s, set] = usePageState('BuildOptimizer', INIT, st => ({ ...st, running: false }));
  const result = s.result;

  const err = s.touched ? budgetCheck(s.budget) : null;
  const budgetNum = parseBudget(s.budget);
  const wide = vw >= 1180;
  const inputsChanged = !!s.run && (budgetNum !== s.run.budget || s.useCase !== s.run.useCase
    || s.cpuBrand !== s.run.cpuBrand || s.gpuBrand !== s.run.gpuBrand || +s.minRam !== s.run.minRam
    || s.excludeOOS !== s.run.excludeOOS || s.lean !== s.run.lean
    || ['graphics', 'processing', 'memory'].some(k => s.pri[k] !== s.run.pri[k]));
  const generate = e => {
    e.preventDefault();
    set({ touched: true });
    const bErr = budgetCheck(s.budget);
    if (bErr) { api.toast('error', 'Check the budget', bErr); return; }
    const run = { budget: parseBudget(s.budget), useCase: s.useCase, pri: { ...s.pri }, cpuBrand: s.cpuBrand, gpuBrand: s.gpuBrand, minRam: +s.minRam, excludeOOS: s.excludeOOS, lean: s.lean };
    if (s.running) return;
    set({ running: true });
    // The dynamic-programming optimizer runs on the server against current database inventory.
    optimizerApi.recommend(run).then(
      out => set({ running: false, run, result: out, view: 0 }),
      e => { set({ running: false }); api.toast('error', 'Optimization failed', e.message); }
    );
  };
  const selects = [
    { label: 'CPU brand', key: 'cpuBrand', options: ['Any', 'AMD', 'Intel'].map(v => ({ value: v, label: v === 'Any' ? 'No preference' : v })) },
    { label: 'GPU brand', key: 'gpuBrand', options: ['Any', 'NVIDIA', 'AMD'].map(v => ({ value: v, label: v === 'Any' ? 'No preference' : v })) },
    { label: 'Minimum memory', key: 'minRam', options: [['0', 'Any'], ['32', '32 GB or more'], ['64', '64 GB']].map(([value, label]) => ({ value, label })) }
  ];
  const check = (checked, onChange, title, note) => (
    <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ width: 16, height: 16, margin: '1px 0 0' }} />
      <span><span style={{ color: '#E6E9ED' }}>{title}</span><br /><span style={{ color: '#7D8692', fontSize: 11.5 }}>{note}</span></span>
    </label>
  );
  const chip = on => ({ bg: on ? 'rgba(163,230,53,0.1)' : '#171B21', border: on ? 'rgba(163,230,53,0.5)' : '#2C333D' });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: wide ? '340px minmax(0,1fr)' : 'minmax(0,1fr)', gap: 16, alignItems: 'start', animation: 'uwin .2s ease-out' }}>
      <form onSubmit={generate} aria-label="Optimization inputs" style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 18, position: wide ? 'sticky' : 'static', top: 76 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Customer requirements</h2>
          <div style={{ fontSize: 12, color: '#7D8692', marginTop: 3 }}>The optimizer never exceeds the budget.</div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#C3C9D0', fontWeight: 500 }}>
          Total budget
          <div style={{ display: 'flex', alignItems: 'center', height: 40, border: `1px solid ${err ? '#F2545B' : '#333B46'}`, borderRadius: 6, background: '#14181E', padding: '0 12px', gap: 6 }}>
            <span style={{ color: '#7D8692' }}>₱</span>
            <input value={s.budget} onChange={e => set({ budget: e.target.value })} inputMode="numeric" aria-invalid={err ? 'true' : 'false'} aria-describedby="budget-msg" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: mono, fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(p => { const on = budgetNum === p, c = chip(on);
              return <button key={p} type="button" onClick={() => set({ budget: String(p) })} style={{ height: 28, padding: '0 9px', borderRadius: 5, border: `1px solid ${c.border}`, background: c.bg, fontFamily: mono, fontSize: 11.5, color: on ? '#A3E635' : '#AEB5BE' }}>₱{p / 1000}k</button>; })}
          </div>
          {err && <div id="budget-msg" style={{ fontSize: 12, color: '#F2545B', fontWeight: 400 }}>{err}</div>}
        </label>

        <fieldset style={{ ...fieldset, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <legend style={{ ...legend, marginBottom: 6 }}>Intended use</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {USES.map(u => { const on = s.useCase === u.label;
              return <button key={u.label} type="button" aria-pressed={on} onClick={() => set({ useCase: u.label })} style={{ height: 38, padding: '0 10px', borderRadius: 6, border: `1px solid ${on ? 'rgba(163,230,53,0.55)' : '#2C333D'}`, background: on ? 'rgba(163,230,53,0.1)' : '#171B21', color: on ? '#E6E9ED' : '#AEB5BE', fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name={u.icon} size={14} />{u.label}</button>; })}
          </div>
        </fieldset>

        <fieldset style={{ ...fieldset, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <legend style={{ ...legend, marginBottom: 8 }}>Performance priorities</legend>
          {[['graphics', 'Graphics'], ['processing', 'Processing (CPU + cooling)'], ['memory', 'Memory and storage']].map(([k, l]) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: '#AEB5BE' }}>{l}</span><span style={{ color: '#E6E9ED', fontFamily: mono }}>{PRI_TEXT[s.pri[k]]}</span></div>
              <input type="range" min="1" max="5" step="1" value={s.pri[k]} onChange={e => set({ pri: { ...s.pri, [k]: +e.target.value } })} aria-label={`${l} priority`} style={{ width: '100%' }} />
            </label>
          ))}
        </fieldset>

        <fieldset style={{ ...fieldset, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <legend style={{ ...legend, marginBottom: 8 }}>Preferences and constraints</legend>
          {selects.map(f => (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#9AA3AE' }}>{f.label}
              <select value={s[f.key]} onChange={e => set({ [f.key]: e.target.value })} style={{ height: 36, border: '1px solid #333B46', borderRadius: 6, background: '#14181E', padding: '0 8px', fontSize: 13 }}>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
        </fieldset>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {check(s.excludeOOS, () => set({ excludeOOS: !s.excludeOOS }), 'Exclude out-of-stock components', `${products.filter(p => p.stock <= 0).length} products are currently out of stock`)}
          {check(s.lean, () => set({ lean: !s.lean }), 'Prefer leaving budget unspent', 'Subtracts up to 15 points for spending the full budget')}
        </div>
        <button type="submit" className="h-bg" disabled={s.running} style={{ '--hbg': '#B5F04F', height: 42, border: 'none', borderRadius: 6, background: '#A3E635', color: '#15191F', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="sparkles" size={16} />{s.running ? 'Optimizing…' : s.run ? 'Regenerate recommendation' : 'Generate recommendation'}
        </button>
      </form>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {inputsChanged && !s.running && <div role="status" style={{ ...card, padding: '12px 16px', color: '#F5B83D', fontSize: 12.5 }}>
          Requirements changed. Generate a recommendation to update these results; the configurations below use the previous requirements.
        </div>}
        {!s.run && !s.running && (
          <div style={{ padding: '48px 24px', border: '1px dashed #333B46', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#1C2129', border: '1px solid #2C333D', display: 'grid', placeItems: 'center' }}><Icon name="sliders-horizontal" size={20} color="#7D8692" /></div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Set requirements, then generate a recommendation</div>
            <div style={{ fontSize: 13, color: '#9AA3AE', maxWidth: 460, lineHeight: 1.55 }}>The optimizer evaluates every compatible platform, then uses dynamic programming to pick one part per remaining category for the highest suitability score within budget.</div>
          </div>
        )}
        {s.running && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#9AA3AE', fontSize: 13 }}><span style={{ width: 16, height: 16, border: '2px solid #333B46', borderTopColor: '#A3E635', borderRadius: '50%', animation: 'uwspin .8s linear infinite' }} />Filling DP tables for each compatible platform…</div>
            <div style={{ height: 220, borderRadius: 8, background: '#1C2129', border: '1px solid #262C35', animation: 'uwpulse 1.2s ease-in-out infinite' }} />
            <div style={{ height: 160, borderRadius: 8, background: '#1C2129', border: '1px solid #262C35', animation: 'uwpulse 1.2s ease-in-out infinite' }} />
          </div>
        )}
        {s.run && !s.running && result && (result.rec.ok
          ? <Result rec={result.rec} alts={result.alts} durationMs={result.durationMs} run={s.run} s={s} set={set} products={products} api={api} />
          : <Fail rec={result.rec} run={s.run} />)}
      </div>
    </div>
  );
}

export function Fail({ rec, run }) {
  const reasons = [];
  if (run.cpuBrand !== 'Any') reasons.push(`CPU brand ${run.cpuBrand}`);
  if (run.gpuBrand !== 'Any') reasons.push(`GPU brand ${run.gpuBrand}`);
  if (run.minRam) reasons.push(`${run.minRam} GB+ memory`);
  if (run.excludeOOS) reasons.push('in-stock parts only');
  const text = rec.minFeasible
    ? rec.minFeasible <= run.budget
      ? `A verified combination costs ${U.peso(rec.minFeasible)}, but conservative rounded group costs do not fit this budget. Increase the budget or relax a preference.`
      : `The cheapest compatible build with these constraints (${reasons.join(', ') || 'none'}) costs ${U.peso(rec.minFeasible)}, which is ${U.peso(rec.minFeasible - run.budget)} over the ${U.peso(run.budget)} budget. Raise the budget or relax a preference.`
    : `No compatible combination exists with these constraints (${reasons.join(', ') || 'none'}). Relax a preference and try again.`;
  return (
    <div role="alert" style={{ padding: 18, borderRadius: 8, border: '1px solid rgba(242,84,91,0.35)', background: 'rgba(242,84,91,0.07)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <Icon name="circle-x" size={18} color="#F2545B" style={{ marginTop: 1 }} />
      <div><div style={{ fontWeight: 600, fontSize: 14 }}>No build returned for these requirements</div><div style={{ fontSize: 13, color: '#D9C2C4', marginTop: 4, lineHeight: 1.55 }}>{text}</div></div>
    </div>
  );
}

export function Result({ rec, alts, durationMs, run, s, set, products, api }) {
  const w = rec.w, uc = run.useCase, budget = run.budget;
  // The returned recommendation/alternative snapshots are authoritative for
  // this run's prices, scores and checks even if current inventory has changed.
  const byId = U.indexProducts(products);
  for (const r of [rec, ...alts.map(a => a.r)]) for (const it of r.items) byId[it.product.id] = it.product;
  for (const r of [rec, ...alts.map(a => a.r)]) for (const id of Object.values(r.sel)) {
    if (!byId[id]) byId[id] = { id, name: `${id} (no longer in inventory)`, category: '', price: 0, stock: 0, minStock: 0, specs: {}, perf: {} };
  }
  const [saving, runSaving] = usePending();
  const saveRun = () => runSaving(async () => {
    try {
      const out = await optimizerApi.saveRun(cur.input);
      api.toast('success', 'Optimization run saved', out.rec.ok ? `${cur.label} configuration recomputed and stored (${U.peso(out.rec.total)}).` : 'The current inventory no longer supports this configuration; the infeasible run was stored.');
    } catch (e) { api.toast('error', 'Run not saved', e.message); }
  });
  const configs = [{ key: 'rec', label: 'Recommended', r: rec, input: run }, ...alts].map(c => ({ ...c,
    userScore: U.scoreBuild(c.r.sel, byId, uc, w), same: c.key !== 'rec' && U.CATEGORIES.every(k => c.r.sel[k.key] === rec.sel[k.key]) }));
  const vi = Math.min(s.view, configs.length - 1), cur = configs[vi];
  const diffs = c => U.CATEGORIES.filter(k => c.r.sel[k.key] !== rec.sel[k.key]).map(k => `${k.label}: ${(byId[c.r.sel[k.key]] || {}).name}`);
  const chk = U.checkBuild(cur.r.sel, byId);
  const parts = U.CATEGORIES.map(k => byId[cur.r.sel[k.key]]);
  const oos = parts.filter(p => !p.virtual && p.stock <= 0), low = parts.filter(p => !p.virtual && p.stock > 0 && p.stock <= p.minStock);
  const total = cur.r.total;
  const isAlt = cur.key !== 'rec';
  const contribs = U.CATEGORIES.map(k => ({ k, v: (w[k.key] || 0) * U.compScore(byId[cur.r.sel[k.key]], k.key, uc) })).sort((a, b) => b.v - a.v);
  const why = !isAlt ? [
    `Best ${run.lean ? 'score minus rounded-spend penalty' : 'weighted score'} in the rounded-cost search domain across ${rec.anchorsFeasible} compatible platforms. Suitability: ${rec.score.toFixed(1)}/100.`,
    `${byId[rec.sel[contribs[0].k.key]].name} and ${byId[rec.sel[contribs[1].k.key]].name} contribute the most points (${contribs[0].v.toFixed(1)} and ${contribs[1].v.toFixed(1)}) under the ${uc} weights.`,
    `${U.peso(rec.remaining)} remains. Conservative ₱${rec.unit} group rounding can exclude builds that fit their actual prices.`,
    `All ${chk.passes.length} compatibility checks pass.${rec.exclusions.oos ? ` ${rec.exclusions.oos} out-of-stock products were excluded.` : ''}${rec.exclusions.unknown.length ? ` Excluded for missing specs: ${rec.exclusions.unknown.join(', ')}.` : ''}`
  ] : [
    cur.key === 'gfx' ? 'Re-optimized with Graphics priority at Max and the others lowered.' : cur.key === 'prod' ? 'Re-optimized with Processing and Memory priorities at Max and Graphics at Low.' : `Re-optimized with 80% of the budget (${U.peso(Math.round(budget * 0.8 / 100) * 100)}).`,
    cur.same ? 'It selected the same parts as the recommended build, so the recommendation is robust to this change.' : `Differs in ${diffs(cur).length} categor${diffs(cur).length > 1 ? 'ies' : 'y'}. Scored with your weights it reaches ${cur.userScore.toFixed(1)} vs ${rec.score.toFixed(1)}.`,
    `All ${chk.passes.length} compatibility checks pass.`
  ];
  const dPrice = total - rec.total, dScore = cur.userScore - rec.score;
  const alloc = U.CATEGORIES.map(k => ({ key: k.key, label: k.label, price: byId[cur.r.sel[k.key]].price, color: ALLOC[k.key] })).filter(a => a.price > 0);
  const compatOk = chk.overall === 'compatible';
  const openInBuilder = () => { api.setBuild(cur.r.sel); api.toast('success', 'Build sent to PC Builder', `${cur.label} configuration (${U.peso(total)}) loaded for review.`); api.go('builder', 'optimizer'); };
  const metric = (label, value, note, color, extra) => (
    <div><div style={{ fontSize: 11.5, color: '#9AA3AE' }}>{label}</div><div style={{ fontFamily: mono, fontSize: 22, marginTop: 3, color }}>{value}{extra}</div><div style={{ fontSize: 11, color: '#6B7480' }}>{note}</div></div>
  );

  return <>
    <div role="tablist" aria-label="Configurations" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {configs.map((c, i) => { const on = i === vi;
        return (
          <button key={c.key} role="tab" aria-selected={on} onClick={() => set({ view: i })} style={{ padding: '8px 12px', borderRadius: 7, border: `1px solid ${on ? 'rgba(163,230,53,0.55)' : '#2A313B'}`, background: on ? 'rgba(163,230,53,0.08)' : '#1C2129', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: on ? '#A3E635' : '#E6E9ED' }}>{c.label}</span>
            <span style={{ fontFamily: mono, fontSize: 11.5, color: '#9AA3AE' }}>{U.peso(c.r.total)} · {c.userScore.toFixed(1)} pts</span>
          </button>
        ); })}
    </div>

    <section style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, borderBottom: '1px solid #262C35' }}>
        {metric('Suitability score', cur.userScore.toFixed(1), `${uc} weighting${isAlt ? ' (your weights)' : ''}`, '#A3E635', <span style={{ fontSize: 13, color: '#7D8692' }}> / 100</span>)}
        {metric('Total build cost', U.peso(total), `Budget ${U.peso(budget)}`)}
        {metric('Remaining budget', U.peso(budget - total), `${Math.round(total / budget * 100)}% of budget used`, '#3FCF8E')}
        <div>
          <div style={{ fontSize: 11.5, color: '#9AA3AE' }}>Compatibility</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, marginTop: 6, color: compatOk ? '#3FCF8E' : '#F5B83D' }}><Icon name={compatOk ? 'shield-check' : 'circle-help'} size={16} />{compatOk ? 'Verified' : chk.overall}</div>
          <div style={{ fontSize: 11, color: '#6B7480', marginTop: 3 }}>{oos.length ? `${oos.length} part(s) out of stock` : low.length ? `All in stock · ${low.length} low` : 'All parts in stock'}</div>
        </div>
      </div>
      {isAlt && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #262C35', background: '#191D23', fontSize: 12.5, color: '#C3C9D0', lineHeight: 1.55 }}>
          <span style={{ fontWeight: 600, color: '#E6E9ED' }}>Trade-off: </span>
          {cur.same ? 'Same parts as the recommended build.' : `${dPrice >= 0 ? '+' : '−'}${U.peso(Math.abs(dPrice))} vs recommended, ${dScore >= 0 ? '+' : ''}${dScore.toFixed(1)} points on your weighting. ${diffs(cur).slice(0, 3).join(' · ')}`}
        </div>
      )}
      {/* Phones: one card per category instead of a five-column table */}
      <div className="sm:hidden">
        {U.CATEGORIES.map(k => {
          const p = byId[cur.r.sel[k.key]], wt = w[k.key] || 0, sc = U.compScore(p, k.key, uc), st = U.stockStatus(p);
          const changed = isAlt && cur.r.sel[k.key] !== rec.sel[k.key];
          return (
            <div key={k.key} style={{ padding: '10px 14px', borderTop: '1px solid #262C35', background: changed ? 'rgba(245,184,61,0.04)' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5, color: '#9AA3AE' }}>
                <span>{k.label}</span><span style={{ fontFamily: mono, color: '#E6E9ED', fontSize: 12.5 }}>{p.virtual ? '₱0' : U.peso(p.price)}</span>
              </div>
              <div style={{ fontWeight: 500, fontSize: 13, marginTop: 2 }}>{p.name}</div>
              <div style={{ fontSize: 11.5, color: changed ? '#F5B83D' : '#7D8692' }}>{changed ? `Changed from ${(byId[rec.sel[k.key]] || {}).name}` : U.specText(p)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 4, fontSize: 11.5 }}>
                <span style={{ color: p.virtual ? '#7D8692' : st.key === 'in' ? '#9AA3AE' : st.color }}>{p.virtual ? 'Included' : p.stock <= 0 ? 'Out of stock' : `${p.stock} · ${st.label}`}</span>
                <span style={{ fontFamily: mono, color: '#C3C9D0' }}>{wt ? `${(wt * sc).toFixed(1)} pts` : '—'}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="max-sm:hidden" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
          <thead><tr style={theadRow}>
            <th style={{ ...th, paddingLeft: 18 }}>Category</th><th style={th}>Component</th><th style={th}>Stock</th><th style={{ ...th, textAlign: 'right' }}>Points</th><th style={{ ...th, paddingRight: 18, textAlign: 'right' }}>Price</th>
          </tr></thead>
          <tbody>
            {U.CATEGORIES.map(k => {
              const p = byId[cur.r.sel[k.key]], wt = w[k.key] || 0, sc = U.compScore(p, k.key, uc), st = U.stockStatus(p);
              const changed = isAlt && cur.r.sel[k.key] !== rec.sel[k.key];
              return (
                <tr key={k.key} style={{ borderTop: '1px solid #262C35', background: changed ? 'rgba(245,184,61,0.04)' : 'transparent' }}>
                  <td style={{ padding: '10px 18px', color: '#9AA3AE', whiteSpace: 'nowrap' }}>{k.label}</td>
                  <td style={{ padding: '10px 8px' }}><div style={{ fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 11.5, color: changed ? '#F5B83D' : '#7D8692' }}>{changed ? `Changed from ${(byId[rec.sel[k.key]] || {}).name}` : U.specText(p)}</div></td>
                  <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontSize: 12, color: p.virtual ? '#7D8692' : st.key === 'in' ? '#9AA3AE' : st.color }}>{p.virtual ? 'Included' : p.stock <= 0 ? 'Out of stock' : `${p.stock} · ${st.label}`}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: mono, fontSize: 12, color: '#C3C9D0', whiteSpace: 'nowrap' }}>{wt ? `${(wt * sc).toFixed(1)}  (${sc}×${Math.round(wt * 100)}%)` : '—'}</td>
                  <td style={{ padding: '10px 18px', textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{p.virtual ? '₱0' : U.peso(p.price)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '14px 18px', borderTop: '1px solid #262C35' }}>
        <div style={{ fontSize: 12, color: '#9AA3AE', marginBottom: 8 }}>Budget allocation</div>
        <div style={{ display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden', gap: 2, background: '#14181E' }}>
          {alloc.map(a => <div key={a.key} title={`${a.label}: ${U.peso(a.price)}`} style={{ width: (a.price / budget * 100).toFixed(2) + '%', flexShrink: 0, background: a.color }} />)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 9 }}>
          {alloc.map(a => <span key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#AEB5BE' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: a.color }} />{a.label} <span style={{ fontFamily: mono, color: '#7D8692' }}>{Math.round(a.price / total * 100)}%</span></span>)}
        </div>
      </div>
      <div style={{ padding: '14px 18px 18px', borderTop: '1px solid #262C35', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{isAlt ? 'About this alternative' : 'Why this build was selected'}</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#AEB5BE', lineHeight: 1.5 }}>
            {why.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
        {api.can('optimizer:save') && <button className="h-bg h-bd" onClick={saveRun} disabled={saving || !cur.input} title="Recomputes this configuration using current inventory, then saves the run and build" style={{ '--hbg': '#2A313B', '--hbd': '#A3E635', height: 38, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13, fontWeight: 500, opacity: saving ? 0.6 : 1 }}>
          <Icon name="save" size={15} color="#A3E635" />{saving ? 'Saving…' : 'Save this configuration'}
        </button>}
        <button className="h-bg h-bd" onClick={openInBuilder} style={{ '--hbg': '#2A313B', '--hbd': '#A3E635', height: 38, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13, fontWeight: 500 }}>
          <Icon name="cpu" size={15} color="#A3E635" />Open in PC Builder
        </button>
      </div>
    </section>

    <section style={{ ...card, padding: '16px 18px' }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 600 }}>Compare configurations</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 600 }}>
          <thead><tr style={theadRow}>
            <th style={{ padding: '8px 8px 8px 0', fontWeight: 500 }}>Configuration</th><th style={{ padding: 8, fontWeight: 500, textAlign: 'right' }}>Total</th><th style={{ padding: 8, fontWeight: 500, textAlign: 'right' }}>Your score</th><th style={{ padding: 8, fontWeight: 500 }}>Main differences vs recommended</th>
          </tr></thead>
          <tbody>
            {configs.map((c, i) => { const d = c.userScore - rec.score;
              return (
                <tr key={c.key} onClick={() => set({ view: i })} style={{ borderTop: '1px solid #262C35', cursor: 'pointer', background: i === vi ? 'rgba(163,230,53,0.05)' : 'transparent' }}>
                  <td style={{ padding: '9px 8px 9px 0', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.label}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{U.peso(c.r.total)}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{c.userScore.toFixed(1)} <span style={{ color: d >= 0 ? '#3FCF8E' : '#F2545B' }}>{i === 0 ? '' : (d >= 0 ? '+' : '') + d.toFixed(1)}</span></td>
                  <td style={{ padding: '9px 8px', color: '#AEB5BE' }}>{i === 0 ? `Best ${run.lean ? 'score-minus-spend objective' : 'weighted score'} in the rounded-cost domain for ${uc}` : c.same ? 'Same parts' : diffs(c).join(' · ')}</td>
                </tr>
              ); })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: '#6B7480', marginTop: 8 }}>Alternatives are re-optimized with shifted priorities or a lower budget, then scored with your current weights so the comparison is like-for-like. The server took {durationMs} ms for all four optimizations on this run (a single measurement, not a benchmark).</div>
    </section>

    <DpExplainer rec={rec} run={run} byId={byId} open={s.dpOpen} toggle={() => set({ dpOpen: !s.dpOpen })} />
  </>;
}

function DpExplainer({ rec, run, byId, open, toggle }) {
  const w = rec.w, uc = run.useCase, t = rec.table;
  const fmtV = v => (v === null || v === -Infinity ? '—' : v.toFixed(1)); // the API sends unreachable states (-∞) as null
  const platform = `${byId[rec.sel.cpu].name} + ${byId[rec.sel.motherboard].name} + ${byId[rec.sel.case].name}`;
  const transitions = [
    { n: '0', stage: 'Platform (enumerated)', options: `${rec.anchorsFeasible} feasible`, choice: `${byId[rec.sel.cpu].name} · ${byId[rec.sel.motherboard].name} · ${byId[rec.sel.case].name}`, cost: U.peso(rec.anchorCost), value: '+' + rec.anchorScore.toFixed(1) + ' pts' },
    ...rec.transitions.map((x, i) => ({ n: String(i + 1), stage: x.stage, options: `${x.options} valid option${x.options > 1 ? 's' : ''}`, choice: x.choice, cost: U.peso(x.cost), value: '+' + x.value.toFixed(1) + ' pts' }))
  ];
  return (
    <section style={card}>
      <button onClick={toggle} aria-expanded={open} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', border: 'none', background: 'none', textAlign: 'left' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>How the dynamic programming optimizer chose this build</span>
        <span style={{ fontFamily: mono, fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: 'rgba(163,230,53,0.1)', color: '#A3E635' }}>DP</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#7D8692" />
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: '#AEB5BE', lineHeight: 1.6 }}>
              <div style={subhead}>Objective</div>
              <div style={{ padding: '10px 12px', borderRadius: 6, background: '#12161B', border: '1px solid #262C35', fontFamily: mono, fontSize: 12, color: '#C3C9D0', lineHeight: 1.7 }}>
                maximize  S = Σ w<sub>c</sub> · s<sub>c</sub>{run.lean ? ' − 15 · cost / budget' : ''}<br />subject to  Σ price ≤ {U.peso(run.budget)}<br />exactly one part per category<br />all 11 compatibility rules pass
              </div>
              <div style={{ ...subhead, marginTop: 4 }}>Formulation (multiple-choice, category-based)</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li><span style={{ color: '#E6E9ED' }}>Platform enumeration.</span> CPU, motherboard, and case decide socket, memory generation, and physical clearances. All {rec.anchorsTotal} compatible CPU + board + case platforms are listed; {rec.anchorsFeasible} can fit the budget.</li>
                <li><span style={{ color: '#E6E9ED' }}>Dependent groups.</span> For each platform, the other categories become groups of options already filtered for compatibility. GPU and PSU are merged into one group of valid pairs because PSU wattage and connectors depend on the GPU.</li>
                <li><span style={{ color: '#E6E9ED' }}>DP over groups.</span> D[i][b] = max<sub>k</sub> ( D[i−1][b − cost<sub>k</sub>] + value<sub>k</sub> ), with budget b in ₱{rec.unit} steps (costs rounded up, so the real total never exceeds the budget). Picking exactly one option per group enforces required categories.</li>
              </ol>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Scoring model · {uc}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {U.CATEGORIES.map(k => { const v = w[k.key] || 0, src = SRC[k.key];
                    return (
                      <tr key={k.key} style={{ borderTop: '1px solid #262C35' }}>
                        <td style={{ padding: '7px 0', color: '#C3C9D0', whiteSpace: 'nowrap' }}>{k.label}</td>
                        <td style={{ padding: '7px 8px', width: '42%' }}><div style={{ height: 6, background: '#14181E', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: (v * 100 / 0.6).toFixed(0) + '%', background: '#A3E635' }} /></div></td>
                        <td style={{ padding: '7px 0', textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{Math.round(v * 100)}%</td>
                        <td className="max-sm:hidden" style={{ padding: '7px 0 7px 10px', color: '#7D8692', fontSize: 11.5 }}>{!v ? 'Dependency only (no score)' : Array.isArray(src) ? (uc === 'Gaming' ? src[0] : src[1]) : src}</td>
                      </tr>
                    ); })}
                </tbody>
              </table>
              <div style={{ fontSize: 11.5, color: '#6B7480', marginTop: 8, lineHeight: 1.5 }}>Component scores (0–100) are illustrative relative indices from the sample catalog, not measured benchmarks. Priorities scale the base weights, which are then normalized to 100%.</div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>DP state table for the winning platform</div>
              <div style={{ fontSize: 11.5, color: '#7D8692' }}>{platform} · {U.peso(rec.subBudget)} left for remaining groups</div>
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid #262C35', borderRadius: 7 }}>
              <table style={{ borderCollapse: 'collapse', fontFamily: mono, fontSize: 11.5, width: '100%', minWidth: 640 }}>
                <thead><tr style={{ background: '#171B21' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500, color: '#9AA3AE', position: 'sticky', left: 0, background: '#171B21' }}>D[i][b] · budget b →</th>
                  {t.cols.map(c => <th key={c.x} style={{ padding: 8, textAlign: 'right', fontWeight: 500, color: '#7D8692', whiteSpace: 'nowrap' }}>{U.pesoShort(c.pesos)}</th>)}
                </tr></thead>
                <tbody>
                  {t.rows.map(r => (
                    <tr key={r.label} style={{ borderTop: '1px solid #262C35' }}>
                      <td style={{ padding: '8px 10px', color: '#C3C9D0', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#1C2129' }}>{r.label}</td>
                      {r.cells.map(c => <td key={c.x} style={{ padding: 8, textAlign: 'right', color: c.onPath ? '#15191F' : c.v === null || c.v === -Infinity ? '#4A525D' : '#C3C9D0', background: c.onPath ? '#A3E635' : 'transparent' }}>{fmtV(c.v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: '#6B7480', marginTop: 6, lineHeight: 1.5 }}>Each cell is the best score obtainable from the groups so far using at most b pesos; “—” means no valid combination fits. Highlighted cells trace the chosen path. Columns are a sample of the {(rec.cap + 1).toLocaleString()} budget states per row.</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Transition trace</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {transitions.map(x => (
                  <div key={x.n} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: 10, padding: '8px 10px', borderRadius: 6, background: '#171B21', border: '1px solid #262C35', fontSize: 12 }}>
                    <span style={{ fontFamily: mono, color: '#A3E635' }}>{x.n}</span>
                    <div style={{ minWidth: 0 }}><div style={{ color: '#9AA3AE', fontSize: 11 }}>{x.stage} · {x.options}</div><div style={{ color: '#E6E9ED' }}>{x.choice}</div></div>
                    <div style={{ textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}><div>{x.cost}</div><div style={{ color: '#A3E635', fontSize: 11 }}>{x.value}</div></div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Best result per platform (top 6 of {rec.anchorsFeasible})</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {rec.topAnchors.map((a, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #262C35', background: i === 0 ? 'rgba(163,230,53,0.05)' : 'transparent' }}>
                        <td style={{ padding: '7px 6px 7px 0', fontFamily: mono, color: '#7D8692' }}>{i + 1}</td>
                        <td style={{ padding: '7px 6px' }}><div>{a.cpu}</div><div style={{ fontSize: 11, color: '#7D8692' }}>{a.mb} · {a.cs}</div></td>
                        <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{U.peso(a.total)}</td>
                        <td style={{ padding: '7px 0 7px 6px', textAlign: 'right', fontFamily: mono, color: '#A3E635' }}>{a.score.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ padding: '12px 14px', borderRadius: 7, background: '#171B21', border: '1px solid #262C35', fontSize: 12.5, color: '#AEB5BE', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600, color: '#E6E9ED' }}>Calculated work and limitations. </span>
            This run evaluated {rec.anchorsTotal} compatible platforms ({rec.anchorsOver} over budget, {rec.anchorsInfeasible} with an empty group) and computed {rec.states.toLocaleString()} DP transitions. Time is O(P · G · B · K): P platforms, G = 4 groups, B = {rec.cap + 1} budget states, K ≤ {rec.maxK} options per group. Space per platform is O(G · B).
            {' '}Because compatibility is resolved by enumerating platforms first, the DP only has to handle independent groups; the cost is that work grows with the number of platforms. Scores are additive, so interactions such as CPU bottlenecks are not modeled. Rounding costs up to ₱{rec.unit} can rarely miss a build that fits within a few pesos of the limit.
          </div>
        </div>
      )}
    </section>
  );
}
