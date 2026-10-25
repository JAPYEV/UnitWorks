import React, { useState } from 'react';
import * as U from '@shared/uw-core.js';
import { Icon, usePageState, mono, card, eyebrow, field, Modal, CloseBtn, Pill, Spinner, ErrorBox, traceIndent } from '../components/ui.jsx';
import { buildsApi } from '../services/api.js';
import { useAsync, usePending } from '../hooks/useAsync.js';

const ST = {
  pass: { icon: 'circle-check', color: '#3FCF8E' }, fail: { icon: 'circle-x', color: '#F2545B' },
  unknown: { icon: 'circle-help', color: '#F5B83D' }, pending: { icon: 'circle-dashed', color: '#5B636E' }
};
const MK = { ok: ['›', '#A3E635', '#E6E9ED'], prune: ['×', '#F2545B', '#C99A9D'], back: ['↰', '#7D8692', '#7D8692'], solution: ['✓', '#3FCF8E', '#3FCF8E'] };
const INIT = { active: 'cpu', q: '', budget: '', inStockOnly: false, spec: null, search: null, searching: false, traceAll: false, checksOpen: true };
const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const sBtn = { height: 36, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13, '--hbg': '#2A313B' };
const pBtn = { height: 36, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 6, background: '#A3E635', color: '#15191F', fontSize: 13, fontWeight: 600, '--hbg': '#B5F04F' };

function budgetVal(raw) {
  const b = raw.replace(/[,₱\s]/g, '');
  if (!b) return { v: null, err: false };
  const n = +b;
  return isFinite(n) && n > 0 && Number.isInteger(n) ? { v: n, err: false } : { v: null, err: true };
}

export default function PCBuilder({ products = [], build = {}, api = {}, vw = 1280 }) {
  const [s, set] = usePageState('PCBuilder', INIT, st => ({ ...st, spec: null, searching: false }));
  const saved = useAsync(() => buildsApi.list(), []);

  const byId = U.indexProducts(products);
  const res = U.checkBuild(build, byId);
  const rail = vw >= 1400, two = vw >= 1024;
  const gridCols = rail ? '230px minmax(0,1fr) 340px' : two ? 'minmax(0,1fr) 330px' : 'minmax(0,1fr)';
  const bv = budgetVal(s.budget);
  const act = U.CAT[s.active];
  const selectedCount = 8 - res.missing.length;
  const over = bv.v != null && res.total > bv.v;

  // The backtracking search runs on the server against current database inventory.
  const runSearch = async () => {
    if (bv.err) return api.toast('error', 'Invalid budget', 'Use a whole peso amount, or clear the field to search without a budget.');
    if (s.searching) return;
    set({ searching: true });
    try {
      const r = await buildsApi.search({ locked: build, budget: bv.v ?? undefined, inStockOnly: s.inStockOnly });
      set({ searching: false, search: r, traceAll: false });
      api.toast(r.solutions.length ? 'success' : 'warning', r.solutions.length ? `${r.solutions.length} valid configuration${r.solutions.length > 1 ? 's' : ''} found` : 'No valid configuration',
        `${r.stats.explored} candidates explored, ${r.stats.pruned} branches pruned.`);
    } catch (e) {
      set({ searching: false });
      api.toast('error', 'Search failed', e.message);
    }
  };
  const toggle = p => {
    if (build[p.category] === p.id) { api.setPart(p.category, null); api.toast('info', `${U.CAT[p.category].label} removed`, p.name); }
    else { const had = !!build[p.category]; api.setPart(p.category, p.id); api.toast('success', had ? `${U.CAT[p.category].label} replaced` : `${U.CAT[p.category].label} added`, p.name); }
  };
  const askReset = () => api.confirm({ title: 'Reset this build?', body: `All ${selectedCount} selected components will be removed from the configuration. Inventory is not affected.`, confirmLabel: 'Reset build', danger: true,
    onConfirm: () => { api.resetBuild(); set({ search: null }); api.toast('info', 'Build reset', 'Start again by choosing a CPU.'); } });

  const cats = U.CATEGORIES.map(c => {
    const p = res.b[c.key], on = s.active === c.key, cc = res.checks.filter(x => x.cats.includes(c.key));
    const dot = !p ? '#3A424E' : cc.some(x => x.status === 'fail') ? '#F2545B' : cc.some(x => x.status === 'unknown') ? '#F5B83D' : '#3FCF8E';
    return { ...c, p, on, dot, bg: on ? 'rgba(163,230,53,0.08)' : '#1C2129', border: on ? 'rgba(163,230,53,0.5)' : '#2A313B', pick: () => set({ active: c.key, q: '' }) };
  });

  const q = s.q.trim().toLowerCase();
  const rows = U.candidatesFor(products, s.active, false).filter(p => !q || (p.name + ' ' + p.brand).toLowerCase().includes(q)).sort((a, b) => a.price - b.price);

  const statusMap = {
    compatible: { icon: 'shield-check', color: '#3FCF8E', bg: 'rgba(63,207,142,0.08)', border: 'rgba(63,207,142,0.3)', title: 'Verified compatible', text: `All ${res.passes.length} compatibility checks passed with known specifications.` },
    incompatible: { icon: 'circle-x', color: '#F2545B', bg: 'rgba(242,84,91,0.08)', border: 'rgba(242,84,91,0.3)', title: `${res.fails.length} conflict${res.fails.length > 1 ? 's' : ''} detected`, text: 'This configuration cannot be assembled as selected. See the issues below.' },
    unverified: { icon: 'circle-help', color: '#F5B83D', bg: 'rgba(245,184,61,0.08)', border: 'rgba(245,184,61,0.3)', title: 'Cannot be fully verified', text: `${res.unknowns.length} check${res.unknowns.length > 1 ? 's' : ''} lack specifications. No conflicts found, but compatibility is not guaranteed.` },
    incomplete: { icon: 'circle-dashed', color: '#AEB5BE', bg: '#171B21', border: '#2C333D', title: 'Incomplete build, not yet verified', text: res.missing.length === 8 ? 'Choose components to start. Each choice is checked against parts already selected.' : `${res.missing.length} categor${res.missing.length > 1 ? 'ies' : 'y'} missing. ${res.passes.length} checks pass so far${res.unknowns.length ? `, ${res.unknowns.length} unverifiable` : ''}.` }
  };
  const status = statusMap[res.overall];
  const issues = [...res.fails.map(c => ({ ...c, ...ST.fail })), ...res.unknowns.map(c => ({ ...c, ...ST.unknown }))];
  const pendingN = res.checks.length - res.passes.length - res.fails.length - res.unknowns.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'uwin .2s ease-out' }}>
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', justifyContent: 'space-between', padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#9AA3AE' }}>
            Budget (optional)
            <div style={{ display: 'flex', alignItems: 'center', height: 36, border: `1px solid ${bv.err ? '#F2545B' : '#333B46'}`, borderRadius: 6, background: '#14181E', padding: '0 10px', gap: 6, width: 180 }}>
              <span style={{ color: '#7D8692' }}>₱</span>
              <input value={s.budget} onChange={e => set({ budget: e.target.value })} inputMode="numeric" placeholder="e.g. 60000" aria-label="Budget in pesos" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: mono, fontSize: 13 }} />
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, fontSize: 13, color: '#C3C9D0', cursor: 'pointer' }}>
            <input type="checkbox" checked={s.inStockOnly} onChange={() => set({ inStockOnly: !s.inStockOnly })} style={{ width: 16, height: 16 }} />In-stock parts only for search
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <button className="h-bg" onClick={askReset} disabled={selectedCount === 0} style={{ ...sBtn, opacity: selectedCount === 0 ? 0.5 : 1 }}><Icon name="rotate-ccw" size={14} />Reset build</button>
          <button className="h-bg" onClick={runSearch} style={pBtn}><Icon name="git-branch" size={15} />Run compatibility search</button>
        </div>
        {bv.err && <div style={{ width: '100%', fontSize: 12, color: '#F2545B' }}>Enter the budget as a whole number of pesos, e.g. 60000.</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 16, alignItems: 'start' }}>
        {rail && (
          <nav aria-label="Component categories" style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 76 }}>
            <div style={{ ...eyebrow, padding: '0 4px 6px' }}>Configuration · {selectedCount}/8</div>
            {cats.map(c => (
              <button key={c.key} className="h-bd" onClick={c.pick} style={{ '--hbd': '#3A424E', display: 'flex', gap: 10, alignItems: 'center', padding: '9px 10px', borderRadius: 7, border: `1px solid ${c.border}`, background: c.bg, textAlign: 'left', minWidth: 0 }}>
                <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 6, display: 'grid', placeItems: 'center', background: '#232932', color: c.on ? '#A3E635' : '#9AA3AE' }}><Icon name={c.icon} size={15} /></span>
                <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.label}</span>
                  <span style={{ fontSize: 11.5, color: c.p ? '#9AA3AE' : '#6B7480', ...ellipsis }}>{c.p ? c.p.name : 'Not selected'}</span>
                </span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: c.dot }} />
              </button>
            ))}
          </nav>
        )}

        <section style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!rail && (
            <div role="tablist" aria-label="Component categories" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cats.map(c => (
                <button key={c.key} role="tab" aria-selected={c.on} onClick={c.pick} style={{ height: 34, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 7, borderRadius: 6, border: `1px solid ${c.border}`, background: c.bg, fontSize: 12.5, fontWeight: 500 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot }} />{c.label}
                </button>
              ))}
            </div>
          )}
          {/* Below 1024px the summary sits after the parts list; this strip keeps the state visible and jumps to it */}
          <button className="lg:hidden" onClick={() => document.getElementById('build-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 7, border: `1px solid ${status.border}`, background: status.bg, textAlign: 'left' }}>
            <Icon name={status.icon} size={16} color={status.color} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
              <span style={{ fontWeight: 600, color: status.color }}>{status.title}</span>
              <span style={{ color: '#9AA3AE' }}> · {selectedCount}/8 parts · <span style={{ fontFamily: mono }}>{U.peso(res.total)}</span></span>
            </span>
            <span style={{ fontSize: 12, color: '#A3E635', whiteSpace: 'nowrap' }}>Summary</span>
            <Icon name="chevron-down" size={14} color="#A3E635" />
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{act.label}</h2>
              <div style={{ fontSize: 12, color: '#7D8692' }}>{s.active === 'gpu' ? 'Integrated graphics is valid only with a CPU that has an iGPU.' : 'Each option is checked against the parts already in your build.'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, border: '1px solid #333B46', borderRadius: 6, background: '#14181E', padding: '0 10px', width: 'min(240px, 100%)' }}>
              <Icon name="search" size={14} color="#7D8692" />
              <input value={s.q} onChange={e => set({ q: e.target.value })} placeholder={`Filter ${act.label.toLowerCase()}`} aria-label="Filter components" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13 }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(p => <PartRow key={p.id} p={p} build={build} active={s.active} byId={byId} onToggle={() => toggle(p)} onSpecs={() => set({ spec: p.id })} />)}
            {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#9AA3AE', fontSize: 13, border: '1px dashed #333B46', borderRadius: 8 }}>No {act.label.toLowerCase()} match “{s.q}”.</div>}
          </div>
        </section>

        <aside id="build-summary" aria-label="Build summary" style={{ scrollMarginTop: 72, minWidth: 0, position: two ? 'sticky' : 'static', top: 76, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #262C35', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Build summary</h2>
              <span style={{ fontSize: 12, color: '#7D8692' }}>{selectedCount} of 8 parts</span>
            </div>
            <div style={{ margin: '12px 16px 4px', padding: '10px 12px', borderRadius: 6, background: status.bg, border: `1px solid ${status.border}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon name={status.icon} size={17} color={status.color} style={{ marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: status.color }}>{status.title}</div>
                <div style={{ fontSize: 12, color: '#AEB5BE', lineHeight: 1.45, marginTop: 2 }}>{status.text}</div>
              </div>
            </div>
            <div style={{ padding: '4px 16px' }}>
              {U.CATEGORIES.map(c => {
                const p = res.b[c.key];
                return (
                  <div key={c.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #262C35' }}>
                    <Icon name={c.icon} size={14} color="#7D8692" style={{ width: 16 }} />
                    <button onClick={() => set({ active: c.key, q: '' })} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', padding: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 11, color: '#7D8692' }}>{c.label}</span>
                      <span style={{ fontSize: 12.5, color: p ? '#E6E9ED' : '#6B7480', ...ellipsis }}>{p ? p.name : 'Not selected'}</span>
                    </button>
                    <span style={{ fontFamily: mono, fontSize: 12, color: '#C3C9D0' }}>{p ? U.peso(p.price) : '—'}</span>
                    {p && <button className="h-bg h-c" onClick={() => api.setPart(c.key, null)} aria-label={`Remove ${c.label}`} style={{ '--hbg': '#2A313B', '--hc': '#F2545B', width: 26, height: 26, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 5, background: 'none', color: '#7D8692' }}><Icon name="x" size={13} /></button>}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#9AA3AE' }}>Total build cost</span><span style={{ fontFamily: mono, fontWeight: 600, fontSize: 15 }}>{U.peso(res.total)}</span></div>
              {bv.v != null && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#9AA3AE' }}>{over ? 'Over budget by' : 'Remaining budget'}</span><span style={{ fontFamily: mono, color: over ? '#F2545B' : '#3FCF8E' }}>{U.peso(Math.abs(bv.v - res.total))}</span></div>}
              {res.missing.length > 0 && res.missing.length < 8 && <div style={{ fontSize: 12, color: '#9AA3AE', lineHeight: 1.45, marginTop: 4 }}>Missing: {res.missing.map(c => c.label).join(', ')}</div>}
              {res.oos.length > 0 && <div style={{ fontSize: 12, color: '#F2545B', lineHeight: 1.45 }}>Out of stock: {res.oos.map(p => p.name).join(', ')}</div>}
            </div>
          </div>

          {api.can('builds:save') && <SaveBuild build={build} selectedCount={selectedCount} budget={bv.v} api={api} onSaved={saved.reload} />}

          {issues.length > 0 && (
            <div style={{ ...card, padding: '14px 16px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>Detected issues</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {issues.map(i => (
                  <div key={i.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <Icon name={i.icon} size={14} color={i.color} style={{ marginTop: 2 }} />
                    <div><div style={{ fontSize: 12.5, fontWeight: 600, color: i.color }}>{i.label}</div><div style={{ fontSize: 12, color: '#AEB5BE', lineHeight: 1.45 }}>{i.detail}</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={card}>
            <button onClick={() => set({ checksOpen: !s.checksOpen })} aria-expanded={s.checksOpen} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Compatibility checks <span style={{ fontWeight: 400, color: '#7D8692' }}>· {res.passes.length} pass · {res.fails.length} fail · {res.unknowns.length} unverified · {pendingN} pending</span></span>
              <Icon name={s.checksOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#7D8692" />
            </button>
            {s.checksOpen && (
              <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {res.checks.map(c => {
                  const t = ST[c.status];
                  return (
                    <div key={c.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                      <Icon name={t.icon} size={14} color={t.color} style={{ marginTop: 1 }} />
                      <div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5 }}>{c.label}</div><div style={{ fontSize: 11.5, color: '#7D8692', lineHeight: 1.4 }}>{c.detail}</div></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      <SearchPanel s={s} set={set} byId={byId} api={api} runSearch={runSearch} />

      <SavedBuilds saved={saved} byId={byId} api={api} />

      {s.spec && byId[s.spec] && <SpecModal p={byId[s.spec]} build={build} onToggle={() => { toggle(byId[s.spec]); set({ spec: null }); }} onClose={() => set({ spec: null })} />}
    </div>
  );
}

function PartRow({ p, build, active, byId, onToggle, onSpecs }) {
  const sel = build[active] === p.id, hasPart = !!build[active];
  const test = U.checkBuild({ ...build, [active]: p.id }, byId);
  const rel = test.checks.filter(c => c.cats.includes(active) && c.status !== 'pending');
  const f = rel.find(c => c.status === 'fail'), u = rel.find(c => c.status === 'unknown');
  const compat = f ? { t: `${f.short}: ${f.detail}`, c: '#F2545B', i: 'circle-x' } : u ? { t: `Cannot verify: ${u.detail}`, c: '#F5B83D', i: 'circle-help' }
    : rel.length ? { t: `Passes ${rel.length} check${rel.length > 1 ? 's' : ''} with your current parts`, c: '#3FCF8E', i: 'circle-check' } : { t: 'No dependent parts selected yet', c: '#7D8692', i: 'circle-dashed' };
  const st = U.stockStatus(p);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'center', padding: '12px 14px', borderRadius: 8, background: sel ? 'rgba(163,230,53,0.05)' : '#1C2129', border: `1px solid ${sel ? 'rgba(163,230,53,0.45)' : f ? 'rgba(242,84,91,0.25)' : '#2A313B'}` }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</span>
          {sel && <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 4, background: '#A3E635', color: '#15191F' }}>Selected</span>}
        </div>
        <div style={{ fontFamily: mono, fontSize: 11.5, color: '#9AA3AE', marginTop: 3 }}>{U.specText(p)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: compat.c }}><Icon name={compat.i} size={13} /><span>{compat.t}</span></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: mono, fontSize: 13.5 }}>{p.virtual ? '₱0' : U.peso(p.price)}</div>
          <div style={{ fontSize: 11.5, color: p.virtual ? '#7D8692' : st.key === 'in' ? '#9AA3AE' : st.color }}>{p.virtual ? 'Included with CPU' : p.stock <= 0 ? 'Out of stock' : `${p.stock} in stock`}</div>
        </div>
        <button className="h-bg" onClick={onSpecs} aria-label={`View specifications for ${p.name}`} style={{ '--hbg': '#2A313B', width: 36, height: 36, display: 'grid', placeItems: 'center', border: '1px solid #333B46', borderRadius: 6, background: '#232932' }}><Icon name="file-text" size={15} /></button>
        <button onClick={onToggle} style={{ height: 36, minWidth: 92, padding: '0 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
          border: `1px solid ${sel ? 'rgba(242,84,91,0.4)' : hasPart ? '#333B46' : '#A3E635'}`, background: sel ? 'transparent' : hasPart ? '#232932' : '#A3E635', color: sel ? '#F2545B' : hasPart ? '#E6E9ED' : '#15191F' }}>
          {sel ? 'Remove' : hasPart ? 'Replace' : 'Add'}
        </button>
      </div>
    </div>
  );
}

function SearchPanel({ s, set, byId, api, runSearch }) {
  const sr = s.search;
  const lockedN = sr ? Object.keys(sr.locked).length : 0;
  return (
    <section aria-label="Backtracking compatibility search" style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Compatibility search</h2>
            <span style={{ fontFamily: mono, fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: 'rgba(163,230,53,0.1)', color: '#A3E635' }}>BACKTRACKING</span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, color: '#AEB5BE', textWrap: 'pretty' }}>Your selected parts are locked. The search assigns the remaining categories one at a time in the order <span style={{ fontFamily: mono, color: '#C3C9D0' }}>CPU → Motherboard → Memory → Case → Cooler → GPU → PSU → Storage</span>. After each assignment it checks only the constraints whose parts are all chosen. If one fails, that branch is pruned and the next candidate is tried; when a category runs out of candidates, it backtracks one level.</p>
        </div>
        <div style={{ fontSize: 12, color: '#7D8692', textAlign: 'right' }}>{sr && !s.searching ? `${lockedN} locked · ${sr.budget ? 'budget ' + U.peso(sr.budget) : 'no budget'} · ran in ${sr.durationMs} ms on the server` : ''}</div>
      </div>

      {s.searching && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#9AA3AE', fontSize: 13, padding: '12px 0' }}>
          <span style={{ width: 16, height: 16, border: '2px solid #333B46', borderTopColor: '#A3E635', borderRadius: '50%', animation: 'uwspin .8s linear infinite' }} />Exploring configurations…
        </div>
      )}
      {!sr && !s.searching && (
        <div style={{ padding: 20, border: '1px dashed #333B46', borderRadius: 8, fontSize: 13, color: '#9AA3AE', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="git-branch" size={18} color="#7D8692" />
          <span style={{ flex: 1, minWidth: 220 }}>Run the search to see which combinations were explored, which branches were pruned, and the valid configurations that include your locked parts.</span>
          <button className="h-bg" onClick={runSearch} style={{ '--hbg': '#2A313B', height: 34, padding: '0 12px', border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13 }}>Run search</button>
        </div>
      )}
      {sr && !s.searching && <SearchResults sr={sr} s={s} set={set} byId={byId} api={api} lockedN={lockedN} />}
    </section>
  );
}

function SearchResults({ sr, s, set, byId, api, lockedN }) {
  const maxR = Math.max(1, ...sr.rejections.map(r => r.count));
  const stats = [
    { label: 'Candidates explored', value: sr.stats.explored, note: 'partial assignments tried', color: '#E6E9ED' },
    { label: 'Constraint checks', value: sr.stats.checks, note: 'rules evaluated', color: '#E6E9ED' },
    { label: 'Branches pruned', value: sr.stats.pruned, note: `${sr.stats.prunedBudget} budget · ${sr.stats.prunedUnknown} unverifiable`, color: '#F2545B' },
    { label: 'Backtracks', value: sr.stats.backtracks, note: 'category exhausted', color: '#E6E9ED' },
    { label: 'Valid builds found', value: sr.solutions.length, note: sr.stopped === 'solutions' ? `stopped at limit of ${sr.maxSolutions}` : 'search completed', color: '#3FCF8E' }
  ];
  const trace = s.traceAll ? sr.trace : sr.trace.slice(0, 40);
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
      {stats.map(x => (
        <div key={x.label} style={{ padding: 12, borderRadius: 7, background: '#171B21', border: '1px solid #262C35' }}>
          <div style={{ fontSize: 11.5, color: '#9AA3AE' }}>{x.label}</div>
          <div style={{ fontFamily: mono, fontSize: 20, marginTop: 4, color: x.color }}>{x.value}</div>
          <div style={{ fontSize: 11, color: '#6B7480', marginTop: 2 }}>{x.note}</div>
        </div>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>Rejected branches by reason</h3>
        {sr.rejections.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sr.rejections.map(r => (
              <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) minmax(0,1fr) 34px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ color: '#C3C9D0' }}>{r.label}</span>
                <div style={{ height: 8, background: '#14181E', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: (r.count / maxR * 100).toFixed(0) + '%', background: '#F2545B', opacity: 0.8 }} /></div>
                <span style={{ fontFamily: mono, textAlign: 'right' }}>{r.count}</span>
              </div>
            ))}
          </div>
        ) : <div style={{ fontSize: 12.5, color: '#9AA3AE' }}>No branch was rejected before the solution limit was reached.</div>}
        <h3 style={{ margin: '18px 0 10px', fontSize: 13, fontWeight: 600 }}>Valid configurations found <span style={{ fontWeight: 400, color: '#7D8692' }}>· cheapest first</span></h3>
        {sr.solutions.length === 0 && (
          <div style={{ padding: 12, borderRadius: 7, border: '1px solid rgba(242,84,91,0.35)', background: 'rgba(242,84,91,0.07)', fontSize: 12.5, color: '#E6C3C5', lineHeight: 1.5 }}>
            No valid configuration contains all locked parts{sr.budget ? ` within ${U.peso(sr.budget)}` : ''}. Remove a conflicting part or raise the budget, then search again.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sr.solutions.slice(0, 5).map((x, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 7, background: '#171B21', border: '1px solid #262C35', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Configuration {i + 1} · <span style={{ fontFamily: mono }}>{U.peso(x.total)}</span></div>
                <div style={{ fontSize: 11.5, color: '#9AA3AE', lineHeight: 1.5, marginTop: 2 }}>{U.SEARCH_ORDER.map(c => (byId[x.sel[c]] || {}).name).join(' · ')}</div>
              </div>
              <button className="h-bg h-bd" onClick={() => { api.setBuild(x.sel); api.toast('success', 'Build applied', `Configuration ${i + 1} loaded into the builder (${U.peso(x.total)}).`); }}
                style={{ '--hbg': '#2A313B', '--hbd': '#A3E635', height: 32, padding: '0 12px', border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 12.5 }}>Use this build</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Search trace</h3>
          <button onClick={() => set({ traceAll: !s.traceAll })} style={{ border: 'none', background: 'none', padding: 0, color: '#A3E635', fontSize: 12.5 }}>{s.traceAll ? 'Show first 40 steps' : `Show all ${sr.trace.length} recorded steps`}</button>
        </div>
        <div style={{ background: '#12161B', border: '1px solid #262C35', borderRadius: 7, padding: '10px 0', maxHeight: s.traceAll ? 560 : 360, overflow: 'auto', fontFamily: mono, fontSize: 11.5, lineHeight: 1.5 }}>
          {trace.map((t, i) => {
            const [mark, color, textColor] = MK[t.kind];
            return (
              <div key={i} style={{ display: 'flex', gap: 8, padding: `2px 12px 2px ${12 + t.depth * traceIndent()}px`, alignItems: 'baseline' }}>
                <span style={{ color, flexShrink: 0, width: 12 }}>{mark}</span>
                <span style={{ color: '#7D8692', flexShrink: 0 }}>{t.kind === 'solution' ? 'DONE' : t.catLabel.toUpperCase()}</span>
                <span style={{ color: textColor, minWidth: 0 }}>{t.name ? `${t.name} — ${t.msg}` : t.msg}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: '#6B7480', marginTop: 8, lineHeight: 1.45 }}>
          Search space without pruning: {sr.space.toLocaleString()} complete combinations for these candidates (calculated). {lockedN} locked part{lockedN === 1 ? '' : 's'}. Trace records the first {sr.trace.length} events. The run time above is one measurement on the server, not evidence of complexity.
        </div>
      </div>
    </div>
  </>;
}

function SpecModal({ p, build, onToggle, onClose }) {
  const st = U.stockStatus(p), fields = U.SPEC_FIELDS[p.category] || [];
  const sel = build[p.category] === p.id;
  const rows = p.virtual ? [{ label: 'Requirement', value: 'CPU with integrated graphics', color: '#E6E9ED' }]
    : fields.map(f => { const v = p.specs[f.key]; return { label: f.label, value: U.has(v) ? v + (f.unit ? ' ' + f.unit : '') : 'Not specified', color: U.has(v) ? '#E6E9ED' : '#F5B83D' }; });
  return (
    <Modal onClose={onClose} label="Product specifications" width={500} pad={16}>
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #2C333D', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: '#7D8692', fontFamily: mono }}>{U.CAT[p.category].label} · {p.sku}</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{p.name}</div>
        </div>
        <CloseBtn onClick={onClose} size={34} />
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', gap: 24, flexWrap: 'wrap', borderBottom: '1px solid #2C333D' }}>
        <div><div style={{ fontSize: 11.5, color: '#7D8692' }}>Price</div><div style={{ fontFamily: mono, fontSize: 15, marginTop: 2 }}>{U.peso(p.price)}</div></div>
        <div><div style={{ fontSize: 11.5, color: '#7D8692' }}>Availability</div><div style={{ fontSize: 13, marginTop: 3, color: p.virtual ? '#AEB5BE' : st.color }}>{p.virtual ? 'Included with CPU' : p.stock <= 0 ? 'Out of stock' : `${st.label} · ${p.stock} units`}</div></div>
        <div><div style={{ fontSize: 11.5, color: '#7D8692' }}>Brand</div><div style={{ fontSize: 13, marginTop: 3 }}>{p.brand}</div></div>
      </div>
      <div style={{ padding: '8px 20px 4px' }}>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid #262C35', fontSize: 13 }}>
            <span style={{ color: '#9AA3AE' }}>{r.label}</span><span style={{ textAlign: 'right', color: r.color, fontFamily: mono, fontSize: 12.5 }}>{r.value}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '14px 20px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11.5, color: '#6B7480', maxWidth: 260 }}>Specifications are sample data. Missing values are treated as unverifiable.</div>
        <button className="h-bg" onClick={onToggle} style={{ ...pBtn, display: 'block' }}>{sel ? 'Remove from build' : build[p.category] ? 'Replace in build' : 'Add to build'}</button>
      </div>
    </Modal>
  );
}

function SaveBuild({ build, selectedCount, budget, api, onSaved }) {
  const [name, setName] = useState('');
  const [pending, runPending] = usePending();
  const save = e => {
    e.preventDefault();
    runPending(async () => {
      try {
        const b = await buildsApi.save({ name: name.trim() || undefined, selection: build, budget: budget ?? undefined });
        api.toast('success', 'Build saved', `${b.name} · ${U.peso(b.totalPrice)} · ${b.status}`);
        setName('');
        onSaved();
      } catch (err) {
        api.toast('error', 'Build not saved', err.message);
      }
    });
  };
  const disabled = pending || selectedCount === 0;
  return (
    <form onSubmit={save} style={{ ...card, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 12, color: '#9AA3AE', display: 'flex', flexDirection: 'column', gap: 5 }}>Save this configuration
        <input className="f-acc" value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="Build name (optional)" style={{ ...field, height: 36 }} />
      </label>
      <button type="submit" className="h-bg" disabled={disabled}
        style={{ '--hbg': '#2A313B', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13, opacity: disabled ? 0.55 : 1 }}>
        <Icon name="save" size={14} color="#A3E635" />{pending ? 'Saving…' : 'Save build'}
      </button>
      <div style={{ fontSize: 11.5, color: '#6B7480', lineHeight: 1.45 }}>The server recalculates compatibility and the total, and stores them with the build.</div>
    </form>
  );
}

const BUILD_STATUS = {
  compatible: ['Compatible', '#3FCF8E', 'rgba(63,207,142,0.12)'], incompatible: ['Conflicts', '#F2545B', 'rgba(242,84,91,0.12)'],
  unverified: ['Unverified', '#F5B83D', 'rgba(245,184,61,0.12)'], incomplete: ['Incomplete', '#AEB5BE', '#262C35']
};

function SavedBuilds({ saved, byId, api }) {
  const { data, error, loading, reload } = saved;
  const load = b => {
    const sel = {}, missing = [];
    for (const c of b.components) {
      const id = c.integrated ? 'igpu' : c.itemId;
      if (byId[id]) sel[c.category] = id; else missing.push(c.name || c.itemId);
    }
    api.setBuild(sel);
    api.toast(missing.length ? 'warning' : 'success', `Loaded “${b.name}”`, missing.length ? `No longer in inventory: ${missing.join(', ')}` : `${Object.keys(sel).length} parts loaded into the builder.`);
    window.scrollTo(0, 0);
  };
  const remove = b => api.confirm({ title: 'Delete this saved build?', body: `“${b.name}” will be removed. Inventory is not affected.`, confirmLabel: 'Delete build', danger: true,
    onConfirm: async () => {
      try { await buildsApi.remove(b.id); api.toast('success', 'Build deleted', b.name); reload(); }
      catch (e) { api.toast('error', 'Delete failed', e.message); }
    } });
  return (
    <section aria-label="Saved builds" style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Saved builds</h2>
        <span style={{ fontSize: 12, color: '#7D8692' }}>Stored in the database · newest first</span>
      </div>
      {error && <ErrorBox title="Couldn’t load saved builds" error={error} onRetry={reload} />}
      {loading && !data && <Spinner label="Loading saved builds…" />}
      {data && data.length === 0 && <div style={{ fontSize: 13, color: '#9AA3AE', padding: '12px 0' }}>No saved builds yet.{api.can('builds:save') ? ' Choose parts above and use “Save build”.' : ' An administrator can save builds.'}</div>}
      {data && data.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map(b => {
            const [label, color, bg] = BUILD_STATUS[b.status];
            return (
              <div key={b.id} style={{ padding: '10px 12px', borderRadius: 7, background: '#171B21', border: '1px solid #262C35', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</span>
                    <Pill color={color} bg={bg}>{label}</Pill>
                    <span style={{ fontSize: 11.5, color: '#6B7480' }}>{b.source}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#9AA3AE', marginTop: 3 }}>
                    <span style={{ fontFamily: mono }}>{U.peso(b.totalPrice)}</span> · {b.components.length}/8 parts · {U.fmtDate(b.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="h-bg" onClick={() => load(b)} style={{ '--hbg': '#2A313B', height: 32, padding: '0 12px', border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 12.5 }}>Load</button>
                  {api.can('builds:save') && <button className="h-bg h-c" onClick={() => remove(b)} aria-label={`Delete ${b.name}`} style={{ '--hbg': 'rgba(242,84,91,0.1)', '--hc': '#F2545B', width: 32, height: 32, display: 'grid', placeItems: 'center', border: '1px solid #333B46', borderRadius: 6, background: '#232932', color: '#9AA3AE' }}><Icon name="trash-2" size={14} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
