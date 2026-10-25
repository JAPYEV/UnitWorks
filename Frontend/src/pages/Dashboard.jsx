import React from 'react';
import * as U from '@shared/uw-core.js';
import { Icon, mono, card, btnSecondary, btnPrimary, ErrorBox } from '../components/ui.jsx';
import { dashboardApi } from '../services/api.js';
import { useAsync } from '../hooks/useAsync.js';

const MV = {
  Sale: ['shopping-cart', '#AEB5BE', '#262C35'], Received: ['package-plus', '#3FCF8E', 'rgba(63,207,142,0.12)'],
  Return: ['undo-2', '#A3E635', 'rgba(163,230,53,0.1)'], Adjustment: ['pencil', '#F5B83D', 'rgba(245,184,61,0.12)']
};
const grid = min => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 12 });
const section = { ...card, padding: 18, minWidth: 0 };
const skel = h => ({ height: h, borderRadius: 8, background: '#1C2129', border: '1px solid #262C35', animation: 'uwpulse 1.2s ease-in-out infinite' });
const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const pct = (a, b) => (b ? (a / b * 100) : 0).toFixed(1) + '%';

function SectionHead({ title, children, mb = 14 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: mb, flexWrap: 'wrap' }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h2>
      {children}
    </div>
  );
}

export default function Dashboard({ api = {}, dataVersion = 0 }) {
  // Statistics are computed by the API from database records; refetched after any data change.
  const { data, error, loading, reload } = useAsync(() => dashboardApi.summary(), [dataVersion]);
  const go = p => () => api.go && api.go(p, 'dashboard');
  const live = !!data && !error && data.totals.products > 0;
  const empty = !!data && !error && data.totals.products === 0;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'uwin .2s ease-out' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#9AA3AE' }}>{today} · <span style={{ color: '#7D8692' }}>Live from the database, refreshed after every change</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="h-bg" onClick={go('builder')} style={{ ...btnSecondary, '--hbg': '#2A313B', fontWeight: 500 }}><Icon name="cpu" size={15} color="#A3E635" />Start a PC build</button>
          <button className="h-bg" onClick={go('restock')} style={{ ...btnPrimary, '--hbg': '#B5F04F' }}><Icon name="truck" size={15} />Generate restocking plan</button>
        </div>
      </div>

      {error && <ErrorBox title="Couldn’t load the inventory summary" error={error} onRetry={reload} />}

      {loading && !data && <>
        <div style={grid(190)}>{[1, 2, 3, 4].map(k => <div key={k} style={skel(112)} />)}</div>
        <div style={grid(420)}><div style={skel(300)} /><div style={skel(300)} /></div>
      </>}

      {empty && (
        <div style={{ padding: '48px 20px', border: '1px dashed #333B46', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#1C2129', border: '1px solid #2C333D', display: 'grid', placeItems: 'center' }}><Icon name="package" size={20} color="#7D8692" /></div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No products in inventory yet</div>
          <div style={{ fontSize: 13, color: '#9AA3AE', maxWidth: 380, lineHeight: 1.5 }}>Add products to see stock health, demand, and restocking alerts here.</div>
          <button className="h-bg" onClick={go('inventory')} style={{ ...btnPrimary, '--hbg': '#B5F04F', marginTop: 6 }}>Go to Inventory Management</button>
        </div>
      )}

      {live && <Live d={data} go={go} />}
    </div>
  );
}

function Live({ d, go }) {
  const t = d.totals, n = t.products;
  const stats = [
    { label: 'Total products', icon: 'package', color: '#A3E635', value: String(n), valueColor: '#E6E9ED', context: `SKUs across ${t.categories} categories · ${t.units.toLocaleString()} units on hand`, onClick: go('inventory') },
    { label: 'Inventory value', icon: 'wallet', color: '#A3E635', value: U.peso(t.valueAtPrice), valueColor: '#E6E9ED', context: `At selling price · ${U.peso(t.valueAtCost)} at unit cost`, onClick: go('inventory') },
    { label: 'Low-stock products', icon: 'triangle-alert', color: '#F5B83D', value: String(t.low), valueColor: t.low ? '#F5B83D' : '#E6E9ED', context: 'At or below their minimum stock threshold', onClick: go('inventory') },
    { label: 'Out-of-stock products', icon: 'circle-x', color: '#F2545B', value: String(t.out), valueColor: t.out ? '#F2545B' : '#E6E9ED', context: 'Cannot be sold or used in builds until received', onClick: go('restock') }
  ];
  const health = [
    { label: 'In stock', count: t.in, color: '#3FCF8E' }, { label: 'Low stock', count: t.low, color: '#F5B83D' }, { label: 'Out of stock', count: t.out, color: '#F2545B' }
  ].map(h => ({ ...h, pct: pct(h.count, n), pctText: Math.round(h.count / Math.max(n, 1) * 100) + '%' }));
  const byCat = d.byCategory.map(c => {
    const k = c.skus || 1;
    return { key: c.key, label: c.label, skus: c.skus + ' SKU', units: c.units, inPct: pct(c.skus - c.out - c.low, k), lowPct: pct(c.low, k), outPct: pct(c.out, k) };
  });
  const critical = d.critical;
  const top = d.topDemand, max = Math.max(0.01, ...top.map(p => p.dailySales));
  const catCols = { display: 'grid', gridTemplateColumns: 'minmax(90px,130px) minmax(0,1fr) 92px', gap: 12 };

  return <>
    <div style={grid(190)}>
      {stats.map(s => (
        <button key={s.label} className="h-bd" onClick={s.onClick} style={{ ...card, '--hbd': '#3A424E', textAlign: 'left', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#9AA3AE', fontWeight: 500 }}><Icon name={s.icon} size={15} color={s.color} />{s.label}</div>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: s.valueColor }}>{s.value}</div>
          <div style={{ fontSize: 12, color: '#7D8692', lineHeight: 1.4 }}>{s.context}</div>
        </button>
      ))}
    </div>

    <div style={grid(440)}>
      <section style={section}>
        <SectionHead title="Inventory health"><div style={{ fontSize: 12, color: '#7D8692' }}>{n} SKUs by stock status</div></SectionHead>
        <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', gap: 2, background: '#14181E' }}>
          {health.map(h => <div key={h.label} style={{ width: h.pct, background: h.color }} />)}
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '10px 0 18px' }}>
          {health.map(h => (
            <div key={h.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: h.color }} />
              <span style={{ color: '#AEB5BE' }}>{h.label}</span>
              <span style={{ fontFamily: mono, color: '#E6E9ED' }}>{h.count}</span>
              <span style={{ fontFamily: mono, color: '#6B7480', fontSize: 11.5 }}>{h.pctText}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ ...catCols, fontFamily: mono, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6B7480' }}>
            <div>Category</div><div>SKU status</div><div style={{ textAlign: 'right' }}>Units</div>
          </div>
          {byCat.map(c => (
            <div key={c.key} style={{ ...catCols, alignItems: 'center', fontSize: 12.5 }}>
              <div style={{ color: '#C3C9D0', ...ellipsis }}>{c.label}</div>
              <div style={{ display: 'flex', height: 8, gap: 2, borderRadius: 2, overflow: 'hidden', background: '#14181E' }}>
                <div style={{ width: c.inPct, background: '#3FCF8E' }} /><div style={{ width: c.lowPct, background: '#F5B83D' }} /><div style={{ width: c.outPct, background: '#F2545B' }} />
              </div>
              <div style={{ textAlign: 'right', fontFamily: mono, color: '#AEB5BE', fontSize: 12 }}>{c.units} <span style={{ color: '#6B7480' }}>/ {c.skus}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...section, display: 'flex', flexDirection: 'column' }}>
        <SectionHead title="Critical restocking alerts" mb={12}><div style={{ fontSize: 12, color: '#7D8692' }}>Stock runs out before a new order could arrive</div></SectionHead>
        {critical.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {critical.map(r => {
              const out = r.stock <= 0;
              return (
                <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #262C35' }}>
                  <span style={{ marginTop: 2, fontFamily: mono, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: out ? 'rgba(242,84,91,0.12)' : 'rgba(245,184,61,0.12)', color: out ? '#F2545B' : '#F5B83D', flexShrink: 0, minWidth: 46, textAlign: 'center' }}>{out ? 'OUT' : r.stock + ' left'}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, ...ellipsis }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: '#9AA3AE', lineHeight: 1.45 }}>{r.reason}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 13 }}>{r.urgency}</div>
                    <div style={{ fontSize: 10.5, color: '#6B7480' }}>urgency</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: '#9AA3AE', fontSize: 13 }}><Icon name="circle-check" size={18} color="#3FCF8E" />No product will run out within its supplier lead time.</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: '#7D8692' }}>{d.criticalCount} critical of {d.reorderCount} products at or below reorder point</div>
          <button className="h-bg" onClick={go('restock')} style={{ ...btnSecondary, '--hbg': '#2A313B', height: 34, padding: '0 12px', gap: 6, fontSize: 12.5 }}>Plan restock<Icon name="arrow-right" size={14} /></button>
        </div>
      </section>
    </div>

    <div style={grid(440)}>
      <section style={section}>
        <SectionHead title="Recent stock movements" mb={8}>
          <button className="h-ul" onClick={go('inventory')} style={{ border: 'none', background: 'none', padding: 0, color: '#A3E635', fontSize: 12.5 }}>Open inventory</button>
        </SectionHead>
        {/* The API omits movement history for roles without movements:view */}
        {d.recentMovements === null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: '#9AA3AE', fontSize: 13 }}>
            <Icon name="lock" size={16} color="#7D8692" />Stock movement history is available to administrators.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {(d.recentMovements || []).map(m => {
            const [icon, color, bg] = MV[m.type] || MV.Adjustment;
            return (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 12px', padding: '9px 0', borderBottom: '1px solid #262C35', alignItems: 'center' }}>
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 5, display: 'grid', placeItems: 'center', background: bg, color }}><Icon name={icon} size={14} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, ...ellipsis }}>{m.productName || 'Removed product'}</div>
                    <div style={{ fontSize: 11.5, color: '#7D8692', ...ellipsis }}>{m.type} · {m.note} · {m.user}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: mono, fontSize: 13, color: m.qty > 0 ? '#3FCF8E' : '#E6E9ED' }}>{(m.qty > 0 ? '+' : '') + m.qty}</div>
                  <div style={{ fontSize: 11, color: '#6B7480', whiteSpace: 'nowrap' }}>{U.fmtDate(m.date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={section}>
        <SectionHead title="High-demand components"><div style={{ fontSize: 12, color: '#7D8692' }}>Average units sold per day</div></SectionHead>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {top.map((p, i) => {
            const s = U.STATUS[p.status];
            return (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                  <div style={{ minWidth: 0, ...ellipsis }}><span style={{ color: '#7D8692', fontFamily: mono, fontSize: 11.5, marginRight: 6 }}>{String(i + 1).padStart(2, '0')}</span>{p.name}</div>
                  <div style={{ flexShrink: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 11.5, color: s.key === 'in' ? '#7D8692' : s.color }}>{p.stock <= 0 ? 'Out of stock' : p.stock + ' in stock'}</span>
                    <span style={{ fontFamily: mono, color: '#E6E9ED' }}>{p.dailySales.toFixed(2)}/d</span>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: '#14181E', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: (p.dailySales / max * 100).toFixed(0) + '%', background: '#A3E635', opacity: 0.85, borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: '#7D8692', lineHeight: 1.5 }}>Demand rates are illustrative 30-day averages and feed the Restock Optimizer’s urgency score.</div>
      </section>
    </div>
  </>;
}
