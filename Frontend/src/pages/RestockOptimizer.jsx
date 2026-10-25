import React, { useEffect, useRef } from 'react';
import * as U from '@shared/uw-core.js';
import { Icon, usePageState, mono, card, Spinner, ErrorBox, Pill } from '../components/ui.jsx';
import { restockApi } from '../services/api.js';
import { useAsync, usePending } from '../hooks/useAsync.js';

const PRESETS = [300000, 600000, 1000000, 1500000];
const SEG = ['#A3E635', '#8CC63F', '#B9EC6B', '#79B33A'];
const DEC = { selected: ['Selected', '#3FCF8E', 'rgba(63,207,142,0.12)'], partial: ['Partial', '#A3E635', 'rgba(163,230,53,0.12)'], skipped: ['Skipped', '#F5B83D', 'rgba(245,184,61,0.12)'] };
const INIT = { budgetInput: '600000', cover: '7', run: { budget: 600000, cover: 7 }, error: null };
const EMPTY_PLAN = { cands: [], selected: [], skipped: [], steps: [], totalCost: 0, remaining: 0, notNeeded: 0, partialCount: 0, greedyValue: 0, knapsack: null };
const parseBudget = s => +s.replace(/[,₱\s]/g, '');
const th = { padding: '10px 8px', fontWeight: 500 };
const thR = { ...th, textAlign: 'right' };
const tdMonoR = { padding: '10px 8px', textAlign: 'right', fontFamily: mono };

function check(raw) {
  const r = raw.replace(/[,₱\s]/g, ''), n = +r;
  if (!r) return 'Enter a purchasing budget.';
  if (!Number.isInteger(n) || n < 0) return 'Use a whole peso amount, e.g. 600000.';
  if (n > 20000000) return 'Budget is above the prototype limit of ₱20,000,000.';
  return null;
}

function rowView(r) {
  const [decision, decColor, decBg] = DEC[r.decision];
  return { ...r, decision, decColor, decBg, cat: U.CAT[r.category].label,
    stockColor: r.stock <= 0 ? '#F2545B' : r.stock <= r.minStock ? '#F5B83D' : '#E6E9ED',
    dtsText: r.stock <= 0 ? '0' : isFinite(r.dts) ? r.dts.toFixed(1) : '—', dtsColor: r.dts < r.lead ? '#F2545B' : '#C3C9D0',
    qtyText: r.decision === 'partial' ? `${r.orderQty}/${r.qty}` : r.decision === 'skipped' ? `(${r.qty})` : r.qty,
    costText: r.decision === 'skipped' ? `(${U.peso(r.cost)})` : U.peso(r.orderCost),
    urgColor: r.urgency >= 60 ? '#F2545B' : r.urgency >= 35 ? '#F5B83D' : '#7D8692', opacity: r.decision === 'skipped' ? 0.72 : 1,
    explain: r.decision === 'skipped' ? `${r.reason}. Skipped: ${r.skipReason}.` : r.decision === 'partial' ? `${r.reason}. Reduced to ${r.orderQty} units to fit the remaining budget.` : r.reason + '.' };
}

export default function RestockOptimizer({ api = {}, vw = 1280, dataVersion = 0 }) {
  const [s, set] = usePageState('RestockOptimizer', INIT);
  // The greedy plan is computed by the server from current database inventory; it is recomputed
  // whenever inputs are submitted or inventory changes.
  const planQ = useAsync(() => restockApi.recommend({ budget: s.run.budget, coverDays: s.run.cover }), [s.run, dataVersion]);
  const plansQ = useAsync(() => restockApi.plans(), [dataVersion]);
  const plan = planQ.data || EMPTY_PLAN, running = planQ.loading;
  const [busy, runBusy] = usePending();
  const announce = useRef(false);
  useEffect(() => {
    if (!announce.current || !planQ.data) return;
    announce.current = false;
    api.toast('success', 'Restock plan updated', `${plan.selected.length} products funded for ${U.peso(plan.totalCost)}; ${plan.skipped.length} skipped.`);
  }, [planQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const B = s.run.budget, inNum = parseBudget(s.budgetInput), err = s.error;
  const stale = inNum !== s.run.budget || +s.cover !== s.run.cover;
  const run = e => {
    e.preventDefault();
    const er = check(s.budgetInput); set({ error: er });
    if (er) return;
    const next = { budget: parseBudget(s.budgetInput), cover: +s.cover };
    announce.current = true;
    set({ run: next });
  };
  const askReceive = () => api.confirm({ title: 'Mark this plan as received?',
    body: `This simulates the delivery of ${plan.selected.length} purchase lines (${plan.selected.reduce((a, r) => a + r.orderQty, 0)} units, ${U.peso(plan.totalCost)}). The server recalculates the plan from current stock, saves it, and records every funded line as received stock in one transaction. No real purchase order is sent.`,
    confirmLabel: 'Receive stock',
    onConfirm: () => runBusy(async () => {
      try {
        const saved = await restockApi.savePlan({ budget: B, coverDays: s.run.cover });
        const r = await restockApi.receive(saved.id);
        api.toast('success', 'Stock received', `${r.lines} products restocked. The plan has been recalculated.`);
        api.refresh();
      } catch (e) { api.toast('error', 'Stock not received', e.message); }
    }) });
  const savePlan = () => runBusy(async () => {
    try {
      const saved = await restockApi.savePlan({ budget: B, coverDays: s.run.cover });
      api.toast('success', 'Restock plan saved', `${saved.plan.selected.length} funded lines saved as a draft.`);
      plansQ.reload();
    } catch (e) { api.toast('error', 'Plan not saved', e.message); }
  });
  const receiveSaved = p => api.confirm({ title: 'Receive this saved plan?',
    body: `All ${p.fundedLines} funded lines (${p.units} units) from the plan saved ${U.fmtDate(p.createdAt)} will be added to stock. A plan can only be received once.`,
    confirmLabel: 'Receive stock',
    onConfirm: () => runBusy(async () => {
      try { const r = await restockApi.receive(p.id); api.toast('success', 'Stock received', `${r.lines} products restocked.`); api.refresh(); }
      catch (e) { api.toast('error', 'Stock not received', e.message); }
    }) });

  const ranked = plan.cands.map(rowView);
  const alloc = plan.selected.map((r, i) => ({ key: r.id, pct: (r.orderCost / Math.max(B, 1) * 100).toFixed(2) + '%', color: SEG[i % SEG.length], title: `#${r.rank} ${r.name}: ${U.peso(r.orderCost)}`,
    text: `Rank ${r.rank} · ${r.name.split(' ').slice(0, 4).join(' ')} · ${U.pesoShort(r.orderCost)}` }));
  if (plan.remaining > 0) alloc.push({ key: 'unspent', pct: (plan.remaining / B * 100).toFixed(2) + '%', color: '#2A313B', title: `Unspent: ${U.peso(plan.remaining)}`, text: `Unspent · ${U.peso(plan.remaining)}` });
  const stats = [
    { label: 'Products selected', value: plan.selected.length, note: `${plan.partialCount} partial · of ${plan.cands.length} needing restock`, color: '#3FCF8E' },
    { label: 'Estimated purchasing cost', value: U.peso(plan.totalCost), note: `${Math.round(plan.totalCost / Math.max(B, 1) * 100)}% of ${U.peso(B)}`, color: '#E6E9ED' },
    { label: 'Remaining budget', value: U.peso(plan.remaining), note: 'Unallocated after all candidates', color: '#A3E635' },
    { label: 'Skipped', value: plan.skipped.length, note: 'Order or MOQ exceeded remaining budget', color: plan.skipped.length ? '#F5B83D' : '#E6E9ED' },
    { label: 'Not needed', value: plan.notNeeded, note: 'Above reorder point', color: '#9AA3AE' }
  ];
  const ks = plan.knapsack;
  const ksText = !ks ? '' : ks.value > plan.greedyValue + 0.5
    ? `Calculated check for this budget: a 0/1 knapsack over full orders (maximizing total urgency, costs rounded up to ₱100) would fund ${ks.count} products for a total urgency of ${Math.round(ks.value)}, versus ${Math.round(plan.greedyValue)} covered by the greedy plan. The greedy plan favours the most urgent items first, even when they are expensive.`
    : `Calculated check for this budget: the greedy plan covers a total urgency of ${Math.round(plan.greedyValue)}, matching or beating a 0/1 knapsack over full orders (costs rounded up to ₱100) (${Math.round(ks.value)}). At other budgets the two can differ.`;
  const noSelected = plan.selected.length === 0;
  const decPill = r => <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 4, background: r.decBg, color: r.decColor, fontSize: 11.5, whiteSpace: 'nowrap', flexShrink: 0 }}>{r.decision}</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'uwin .2s ease-out' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
        <form onSubmit={run} aria-label="Restock inputs" style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Purchasing budget</h2><div style={{ fontSize: 12, color: '#7D8692', marginTop: 3 }}>Change the budget or coverage target and rerun the greedy plan.</div></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#AEB5BE', flex: '1 1 180px' }}>Available budget
              <div style={{ display: 'flex', alignItems: 'center', height: 40, border: `1px solid ${err ? '#F2545B' : '#333B46'}`, borderRadius: 6, background: '#14181E', padding: '0 12px', gap: 6 }}>
                <span style={{ color: '#7D8692' }}>₱</span>
                <input value={s.budgetInput} onChange={e => set({ budgetInput: e.target.value, error: null })} inputMode="numeric" aria-invalid={err ? 'true' : 'false'} aria-label="Purchasing budget in pesos" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: mono, fontSize: 14 }} />
              </div>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#AEB5BE', flex: '0 1 160px' }}>Coverage after arrival
              <select value={s.cover} onChange={e => set({ cover: e.target.value })} style={{ height: 40, border: '1px solid #333B46', borderRadius: 6, background: '#14181E', padding: '0 10px', fontSize: 13 }}>
                {[['7', '7 days'], ['14', '14 days'], ['30', '30 days']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <button type="submit" className="h-bg" disabled={running} style={{ '--hbg': '#B5F04F', height: 40, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 6, background: '#A3E635', color: '#15191F', fontWeight: 600, fontSize: 13 }}>
              <Icon name="play" size={14} />{running ? 'Running…' : 'Run greedy optimizer'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(p => { const on = inNum === p;
              return <button key={p} type="button" onClick={() => set({ budgetInput: String(p), error: null })} style={{ height: 28, padding: '0 9px', borderRadius: 5, border: `1px solid ${on ? 'rgba(163,230,53,0.5)' : '#2C333D'}`, background: on ? 'rgba(163,230,53,0.1)' : '#171B21', fontFamily: mono, fontSize: 11.5, color: on ? '#A3E635' : '#AEB5BE' }}>{p >= 1e6 ? '₱' + p / 1e6 + 'M' : '₱' + p / 1000 + 'k'}</button>; })}
          </div>
          {err && <div role="alert" style={{ fontSize: 12, color: '#F2545B' }}>{err}</div>}
          {stale && !running && !err && <div style={{ fontSize: 12, color: '#F5B83D', display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="info" size={13} />Inputs changed. Run the optimizer to update the plan.</div>}
        </form>
        <section style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Priority rule</h2><span style={{ fontFamily: mono, fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: 'rgba(163,230,53,0.1)', color: '#A3E635' }}>GREEDY</span></div>
          <div style={{ padding: '10px 12px', borderRadius: 6, background: '#12161B', border: '1px solid #262C35', fontFamily: mono, fontSize: 12, color: '#C3C9D0', lineHeight: 1.75 }}>
            <div>urgency = 100 × ( 0.6 × min(lead ÷ days_left, 3) ÷ 3</div><div style={{ paddingLeft: '8.5em' }}>+ 0.4 × daily_sales ÷ max_daily )</div><div>order_qty = max(MOQ, ⌈min + daily × (lead + cover)⌉ − stock)</div>
          </div>
          <div style={{ fontSize: 12.5, color: '#AEB5BE', lineHeight: 1.55, textWrap: 'pretty' }}>Products at or below their reorder point (daily sales × lead time + minimum stock) are ranked by urgency, then funded in order. Each step takes the most urgent remaining product if its order fits; otherwise it buys the largest affordable quantity that still meets the MOQ, or skips it.</div>
        </section>
      </div>

      {running && <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#9AA3AE', fontSize: 13 }}><span style={{ width: 16, height: 16, border: '2px solid #333B46', borderTopColor: '#A3E635', borderRadius: '50%', animation: 'uwspin .8s linear infinite' }} />Ranking candidates and allocating budget…</div>}

      {planQ.error && <ErrorBox title="Couldn’t calculate the restock plan" error={planQ.error} onRetry={planQ.reload} />}

      {!running && planQ.data && plan.cands.length === 0 && (
        <div style={{ padding: '40px 20px', border: '1px dashed #333B46', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
          <Icon name="circle-check" size={22} color="#3FCF8E" />
          <div style={{ fontSize: 14, fontWeight: 600 }}>No product needs replenishment</div>
          <div style={{ fontSize: 12.5, color: '#9AA3AE' }}>Every product is above its reorder point. Nothing was purchased.</div>
        </div>
      )}

      {!running && planQ.data && plan.cands.length > 0 && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12 }}>
          {stats.map(x => (
            <div key={x.label} style={{ ...card, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: '#9AA3AE' }}>{x.label}</div>
              <div style={{ fontFamily: mono, fontSize: 21, marginTop: 4, color: x.color }}>{x.value}</div>
              <div style={{ fontSize: 11.5, color: '#6B7480', marginTop: 2 }}>{x.note}</div>
            </div>
          ))}
        </div>

        <section style={{ ...card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Budget allocation in selection order</h3>
            <div style={{ fontSize: 12, color: '#7D8692' }}>{U.peso(plan.totalCost)} allocated · {U.peso(plan.remaining)} unspent</div>
          </div>
          <div style={{ display: 'flex', height: 18, borderRadius: 3, overflow: 'hidden', gap: 2, background: '#14181E' }}>
            {alloc.map(a => <div key={a.key} title={a.title} style={{ width: a.pct, flexShrink: 0, background: a.color }} />)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 9 }}>
            {alloc.map(a => <span key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#AEB5BE' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: a.color }} />{a.text}</span>)}
          </div>
        </section>

        <section style={card}>
          <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid #262C35' }}>
            <div><h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Ranked restocking plan</h3><div style={{ fontSize: 12, color: '#7D8692', marginTop: 2 }}>Ranked by urgency · costs use unit purchasing cost · {s.run.cover}-day coverage target</div></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!api.can('restock:save') && !api.can('restock:receive') && <span style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#9AA3AE' }}><Icon name="lock" size={14} />View only: an administrator saves and receives plans</span>}
            {api.can('restock:save') && <button className="h-bg h-bd" onClick={savePlan} disabled={busy || noSelected} style={{ '--hbg': '#2A313B', '--hbd': '#A3E635', height: 36, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13, opacity: busy || noSelected ? 0.5 : 1 }}>
              <Icon name="save" size={15} color="#A3E635" />Save plan
            </button>}
            {api.can('restock:receive') && api.can('restock:save') && <button className="h-bg h-bd" onClick={askReceive} disabled={busy || noSelected} style={{ '--hbg': '#2A313B', '--hbd': '#A3E635', height: 36, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13, opacity: busy || noSelected ? 0.5 : 1 }}>
              <Icon name="package-check" size={15} color="#A3E635" />{busy ? 'Working…' : 'Mark plan as received'}
            </button>}
            </div>
          </div>
          {vw >= 900 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1080 }}>
                <thead><tr style={{ textAlign: 'left', fontFamily: mono, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6B7480' }}>
                  <th style={{ ...th, paddingLeft: 18 }}>#</th><th style={th}>Product</th><th style={thR}>Stock</th><th style={thR}>Days left</th><th style={thR}>Lead</th><th style={thR}>Order</th><th style={thR}>Est. cost</th><th style={th}>Urgency</th><th style={th}>Decision</th><th style={{ ...th, paddingRight: 18 }}>Explanation</th>
                </tr></thead>
                <tbody>
                  {ranked.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid #262C35', opacity: r.opacity }}>
                      <td style={{ padding: '10px 8px 10px 18px', fontFamily: mono, color: '#7D8692' }}>{r.rank}</td>
                      <td style={{ padding: '10px 8px', maxWidth: 250 }}><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: 11, color: '#7D8692' }}>{r.cat} · {r.daily.toFixed(2)}/day · MOQ {r.moq}</div></td>
                      <td style={{ ...tdMonoR, color: r.stockColor }}>{r.stock}</td>
                      <td style={{ ...tdMonoR, color: r.dtsColor }}>{r.dtsText}</td>
                      <td style={{ ...tdMonoR, color: '#AEB5BE' }}>{r.lead}d</td>
                      <td style={tdMonoR}>{r.qtyText}</td>
                      <td style={{ ...tdMonoR, whiteSpace: 'nowrap' }}>{r.costText}</td>
                      <td style={{ padding: '10px 8px', minWidth: 110 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, height: 6, borderRadius: 3, background: '#14181E', overflow: 'hidden' }}><div style={{ height: '100%', width: r.urgency + '%', background: r.urgColor }} /></div><span style={{ fontFamily: mono, width: 24, textAlign: 'right' }}>{r.urgency}</span></div></td>
                      <td style={{ padding: '10px 8px' }}>{decPill(r)}</td>
                      <td style={{ padding: '10px 18px 10px 8px', color: '#AEB5BE', fontSize: 12, lineHeight: 1.45, minWidth: 240 }}>{r.explain}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {ranked.map(r => {
                const cell = (l, v, color) => <div><div style={{ fontSize: 10.5, color: '#7D8692' }}>{l}</div><div style={{ fontFamily: mono, color }}>{v}</div></div>;
                return (
                  <div key={r.id} style={{ padding: '12px 14px', borderTop: '1px solid #262C35', display: 'flex', flexDirection: 'column', gap: 8, opacity: r.opacity }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: mono, color: '#7D8692', fontSize: 12, marginTop: 2 }}>#{r.rank}</span>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</div><div style={{ fontSize: 11.5, color: '#7D8692' }}>{r.cat} · {r.daily.toFixed(2)}/day · MOQ {r.moq}</div></div>
                      {decPill(r)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8, fontSize: 12 }}>
                      {cell('Stock', r.stock, r.stockColor)}{cell('Days left', r.dtsText, r.dtsColor)}{cell('Order', r.qtyText)}{cell('Urgency', r.urgency)}
                    </div>
                    <div style={{ fontSize: 12, color: '#AEB5BE', lineHeight: 1.45 }}><span style={{ fontFamily: mono, color: '#E6E9ED' }}>{r.costText}</span> · {r.explain}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
          <section style={{ ...card, padding: '16px 18px', minWidth: 0 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 600 }}>Selection sequence</h3>
            <div style={{ fontSize: 12, color: '#7D8692', marginBottom: 12 }}>Budget after each greedy decision</div>
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 460, overflow: 'auto' }}>
              {plan.steps.map(st => {
                const skip = st.decision === 'skipped';
                const note = skip ? 'Skipped · ' + st.note : (st.decision === 'partial' ? 'Partial · ' : 'Selected · ') + st.note + ` (${U.peso(st.r.orderCost)})`;
                return (
                  <div key={st.rank} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: 10, padding: '8px 0', borderBottom: '1px solid #262C35', alignItems: 'center' }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: mono, fontSize: 11, background: skip ? '#262C35' : 'rgba(163,230,53,0.14)', color: skip ? '#7D8692' : '#A3E635' }}>{st.rank}</span>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.r.name}</div><div style={{ fontSize: 11.5, color: skip ? '#C9A95E' : '#9AA3AE', lineHeight: 1.4 }}>{note}</div></div>
                    <div style={{ textAlign: 'right', fontFamily: mono, fontSize: 11.5, whiteSpace: 'nowrap' }}><div style={{ color: '#7D8692' }}>{U.peso(st.before)}</div><div style={{ color: skip ? '#7D8692' : '#E6E9ED' }}>→ {U.peso(st.after)}</div></div>
                  </div>
                );
              })}
            </div>
          </section>
          <section style={{ ...card, padding: '16px 18px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 600 }}>Skipped products</h3>
              <div style={{ fontSize: 12, color: '#7D8692', marginBottom: 10 }}>{plan.skipped.length ? `${plan.skipped.length} products could not be funded with the remaining budget` : 'Every candidate was funded.'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflow: 'auto' }}>
                {plan.skipped.map(r => (
                  <div key={r.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <Icon name="circle-minus" size={14} color="#F5B83D" style={{ marginTop: 2 }} />
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5 }}>{r.name} <span style={{ color: '#7D8692', fontFamily: mono, fontSize: 11 }}>urgency {r.urgency}</span></div><div style={{ fontSize: 11.5, color: '#AEB5BE', lineHeight: 1.45 }}>{r.skipReason}</div></div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 7, background: '#171B21', border: '1px solid #262C35' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Why greedy is not guaranteed optimal</div>
              <div style={{ fontSize: 12, color: '#AEB5BE', lineHeight: 1.6, textWrap: 'pretty' }}>Greedy commits to the most urgent product at each step and never revisits that choice. An expensive urgent order can consume budget that would have covered several moderately urgent products. Its strength is speed and an explainable order of decisions.</div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#C3C9D0', lineHeight: 1.6 }}>{ksText}</div>
            </div>
          </section>
        </div>
      </>}

      <SavedPlans q={plansQ} onReceive={api.can('restock:receive') ? receiveSaved : null} busy={busy} />
    </div>
  );
}

function SavedPlans({ q, onReceive, busy }) {
  const { data, error, loading, reload } = q;
  return (
    <section aria-label="Saved restock plans" style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Saved plans</h3>
        <span style={{ fontSize: 12, color: '#7D8692' }}>Stored in the database · latest 10</span>
      </div>
      {error && <ErrorBox title="Couldn’t load saved plans" error={error} onRetry={reload} />}
      {loading && !data && <Spinner label="Loading saved plans…" />}
      {data && data.length === 0 && <div style={{ fontSize: 12.5, color: '#9AA3AE' }}>No saved plans yet.{onReceive ? " Use “Save plan” to keep a draft, or “Mark plan as received” to save and receive in one step." : ""}</div>}
      {data && data.map(p => (
        <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 7, background: '#171B21', border: '1px solid #262C35' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ fontFamily: mono }}>{U.peso(p.totalCost)}</span>
              <span style={{ color: '#7D8692', fontSize: 12 }}>of {U.peso(p.budget)} · {p.coverDays}-day cover</span>
              {p.status === 'received' ? <Pill color="#3FCF8E" bg="rgba(63,207,142,0.12)">Received</Pill> : <Pill color="#F5B83D" bg="rgba(245,184,61,0.12)">Draft</Pill>}
            </div>
            <div style={{ fontSize: 11.5, color: '#9AA3AE', marginTop: 3 }}>{p.fundedLines} funded lines · {p.units} units · saved {U.fmtDate(p.createdAt)}{p.receivedAt ? ` · received ${U.fmtDate(p.receivedAt)}` : ''}</div>
          </div>
          {p.status === 'draft' && onReceive && (
            <button className="h-bg" onClick={() => onReceive(p)} disabled={busy || p.fundedLines === 0} style={{ '--hbg': '#2A313B', height: 32, padding: '0 12px', border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 12.5, opacity: busy || p.fundedLines === 0 ? 0.5 : 1 }}>Mark received</button>
          )}
        </div>
      ))}
    </section>
  );
}
