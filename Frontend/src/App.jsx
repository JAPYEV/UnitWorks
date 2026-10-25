import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutDashboard, Cpu, SlidersHorizontal, Package, Truck, GitBranch, Menu, ArrowLeft, Bell, ChevronDown,
  Info, RefreshCw, X, CircleCheck, CircleX, TriangleAlert, CircleHelp, LogOut } from 'lucide-react';
import { useAuth } from './auth/AuthProvider.jsx';
import { ROLES } from '@shared/permissions.js';
import { inventoryApi } from './services/api.js';
import { Spinner, ErrorBox, Logo, Wordmark } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PCBuilder from './pages/PCBuilder.jsx';
import BuildOptimizer from './pages/BuildOptimizer.jsx';
import Inventory from './pages/Inventory.jsx';
import RestockOptimizer from './pages/RestockOptimizer.jsx';
import AlgorithmAnalysis from './pages/AlgorithmAnalysis.jsx';

const PAGES = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, sub: 'Inventory health and recent shop activity' },
  { key: 'builder', label: 'PC Builder', Icon: Cpu, tag: 'BT', sub: 'Assemble a build and validate compatibility with backtracking search' },
  { key: 'optimizer', label: 'Build Optimizer', Icon: SlidersHorizontal, tag: 'DP', sub: 'Find the best compatible build for a budget with dynamic programming' },
  { key: 'inventory', label: 'Inventory Management', Icon: Package, sub: 'Products, stock levels, thresholds, and adjustments' },
  { key: 'restock', label: 'Restock Optimizer', Icon: Truck, tag: 'Greedy', sub: 'Prioritize replenishment within a purchasing budget' },
  { key: 'analysis', label: 'Algorithm Analysis', Icon: GitBranch, sub: 'Traces, states, and complexity for the three algorithms' }
];
// Only the in-progress PC Builder selection is kept in the browser (a draft, like an unsaved form).
// All inventory, movements, saved builds, runs and plans live in the database behind the API.
const BUILD_KEY = 'unitworks.build-draft.v1';
const TOAST = {
  success: { Icon: CircleCheck, color: '#3FCF8E' }, error: { Icon: CircleX, color: '#F2545B' },
  warning: { Icon: TriangleAlert, color: '#F5B83D' }, info: { Icon: Info, color: '#A3E635' }
};
const mono = "'Geist Mono',monospace";
const pageFromHash = () => { const k = location.hash.replace('#', ''); return PAGES.some(p => p.key === k) ? k : null; };

function loadBuildDraft() {
  try { return JSON.parse(localStorage.getItem(BUILD_KEY) || 'null') || {}; } catch { return {}; }
}

const PAGE_COMPONENTS = { dashboard: Dashboard, builder: PCBuilder, optimizer: BuildOptimizer, inventory: Inventory, restock: RestockOptimizer, analysis: AlgorithmAnalysis };


export default function App() {
  const auth = useAuth(); // signed in and confirmed by the API (AuthGate guarantees it)
  const [page, setPage] = useState(() => pageFromHash() || 'dashboard');
  const [backTo, setBackTo] = useState(null);
  const [vw, setVw] = useState(window.innerWidth);
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const [profile, setProfile] = useState(false);
  const [about, setAbout] = useState(false);
  // Active inventory from the API; shared by the header alerts, PC Builder and analysis controls.
  const [products, setProducts] = useState([]);
  const [loadState, setLoadState] = useState({ loading: true, error: null });
  const [dataVersion, setDataVersion] = useState(0); // bumps after every successful mutation
  const [build, setBuild] = useState(loadBuildDraft);
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const headerRef = useRef(null);

  const go = useCallback((p, from) => {
    setPage(p); setBackTo(from || null); setDrawer(false); setBell(false); setProfile(false);
    try { history.replaceState(null, '', '#' + p); } catch (e) {}
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onResize = () => { setVw(window.innerWidth); if (window.innerWidth >= 1024) setDrawer(false); };
    const onHash = () => { const k = pageFromHash(); if (k) { setPage(k); setBackTo(null); } };
    const onKey = e => { if (e.key === 'Escape') { setDrawer(false); setBell(false); setProfile(false); setAbout(false); setConfirm(null); } };
    const onDoc = e => { if (!e.target.closest('header')) { setBell(false); setProfile(false); } };
    window.addEventListener('resize', onResize); window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey); document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('resize', onResize); window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDoc);
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoadState(s => ({ ...s, loading: true, error: null }));
    try {
      setProducts(await inventoryApi.all());
      setDataVersion(v => v + 1);
      setLoadState({ loading: false, error: null });
    } catch (error) {
      setLoadState({ loading: false, error });
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Drop draft parts that no longer exist (archived elsewhere) once inventory is loaded.
  useEffect(() => {
    if (loadState.loading || loadState.error) return;
    const ids = new Set(products.map(p => p.id));
    setBuild(b => {
      const n = Object.fromEntries(Object.entries(b).filter(([, id]) => id === 'igpu' || ids.has(id)));
      return Object.keys(n).length === Object.keys(b).length ? b : n;
    });
  }, [products, loadState]);

  useEffect(() => {
    try { localStorage.setItem(BUILD_KEY, JSON.stringify(build)); } catch { /* storage unavailable */ }
  }, [build]);

  const api = useMemo(() => ({
    toast: (type, title, msg) => {
      const id = Math.random().toString(36).slice(2);
      setToasts(t => [...t.slice(-3), { id, type, title, msg }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
    },
    confirm: opts => { setConfirm(opts); setBell(false); setProfile(false); },
    go,
    refresh,
    setPart: (cat, id) => setBuild(b => { const n = { ...b }; if (id) n[cat] = id; else delete n[cat]; return n; }),
    setBuild: sel => setBuild({ ...sel }),
    // Permission check for showing controls. The API enforces the same permissions on every request.
    can: auth.can,
    resetBuild: () => setBuild({})
  }), [go, refresh, auth.can]);

  const compact = vw < 1024, mobile = vw < 640;
  const cur = PAGES.find(p => p.key === page) || PAGES[0];
  const flagged = useMemo(() => products.filter(p => p.stock <= p.minStock).sort((a, b) => a.stock - b.stock || b.dailySales - a.dailySales), [products]);
  const outN = flagged.filter(p => p.stock <= 0).length;
  const padX = mobile ? 14 : 28;
  const hasBack = !!backTo && backTo !== page;
  const backLabel = (PAGES.find(p => p.key === backTo) || {}).label;

  const me = auth.me;
  const initials = (me.name || me.email).split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const signOut = () => { setProfile(false); auth.signOut(); };
  const reloadData = () => { setProfile(false); refresh().then(() => api.toast('info', 'Data refreshed', 'Inventory reloaded from the database.')); };
  const doConfirm = () => { const fn = confirm && confirm.onConfirm; setConfirm(null); fn && fn(); };

  const NavList = ({ big }) => PAGES.map(p => {
    const on = p.key === page, showBadge = p.key === 'inventory' && flagged.length > 0, showTag = !!p.tag;
    return (
      <button key={p.key} className="nav-btn" onClick={() => go(p.key)} aria-current={on ? 'page' : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: big ? 12 : 11, height: big ? 46 : 38, padding: '0 12px', border: 'none', borderRadius: 6,
          background: on ? 'rgba(163,230,53,0.1)' : 'transparent', color: on ? '#E6E9ED' : '#AEB5BE', fontSize: big ? 14.5 : 13.5, fontWeight: on ? 600 : 500, textAlign: 'left' }}>
        <p.Icon size={big ? 18 : 17} color={on ? '#A3E635' : '#7D8692'} />
        <span style={{ flex: 1 }}>{p.label}</span>
        {!big && showBadge && <span style={{ fontFamily: mono, fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'rgba(245,184,61,0.14)', color: '#F5B83D' }}>{flagged.length}</span>}
        {showTag && <span style={{ fontFamily: mono, fontSize: big ? 10.5 : 10, color: '#6B7480', letterSpacing: '0.02em' }}>{p.tag}</span>}
      </button>
    );
  });

  const iconBtn = { display: 'grid', placeItems: 'center', border: '1px solid #2C333D', borderRadius: 6, background: '#1C2129' };
  const popup = { position: 'absolute', top: 46, right: 0, background: '#1F252D', border: '1px solid #333B46', borderRadius: 8, boxShadow: '0 16px 40px rgba(0,0,0,0.45)', zIndex: 50, animation: 'uwin .14s ease-out' };
  const modalWrap = { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16 };
  const scrim = { position: 'absolute', inset: 0, background: 'rgba(8,10,13,0.66)' };
  const Page = PAGE_COMPONENTS[page];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#15191F', color: '#E6E9ED' }}>
      {!compact && (
        <aside style={{ width: 244, flexShrink: 0, background: '#1A1F26', borderRight: '1px solid #262C35', position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 60, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderBottom: '1px solid #262C35' }}>
            <Logo /><div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}><Wordmark /></div>
          </div>
          <nav aria-label="Primary" style={{ padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}><NavList /></nav>
          <div style={{ padding: '14px 18px', borderTop: '1px solid #262C35', fontSize: 12, lineHeight: 1.5, color: '#7D8692' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9AA3AE', fontWeight: 500, marginBottom: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F5B83D' }} />Prototype mode
            </div>
            Database-backed demo. Seed prices and stock are illustrative, not live market data.
          </div>
        </aside>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header ref={headerRef} style={{ position: 'sticky', top: 0, zIndex: 30, height: 60, background: 'rgba(21,25,31,0.94)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #262C35', display: 'flex', alignItems: 'center', gap: 12, padding: `0 ${padX}px` }}>
          {compact && (
            <button onClick={() => setDrawer(true)} aria-label="Open navigation" style={{ ...iconBtn, width: 40, height: 40, marginLeft: -4 }}><Menu size={18} /></button>
          )}
          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {hasBack && (
              <button className="hv h-c" onClick={() => go(backTo)} style={{ '--hbg': 'none', '--hc': '#A3E635', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', padding: 0, color: '#9AA3AE', fontSize: 12 }}>
                <ArrowLeft size={13} />Back to {backLabel}
              </button>
            )}
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur.label}</h1>
            {vw >= 520 && <div style={{ fontSize: 12, color: '#7D8692', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur.sub}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <button className="hv" onClick={() => { setBell(!bell); setProfile(false); }} aria-label="Stock alerts" aria-expanded={bell} style={{ ...iconBtn, width: 38, height: 38, position: 'relative' }}>
              <Bell size={17} color="#C3C9D0" />
              {flagged.length > 0 && <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#F2545B', color: '#15191F', fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center', fontFamily: mono }}>{flagged.length}</span>}
            </button>
            <button className="hv" onClick={() => { setProfile(!profile); setBell(false); }} aria-label="Account menu" aria-expanded={profile} style={{ ...iconBtn, height: 38, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 4px' }}>
              <span style={{ width: 28, height: 28, borderRadius: 5, background: '#2A313B', display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 600, color: '#A3E635' }}>{initials}</span>
              {vw >= 760 && <span style={{ fontSize: 13, fontWeight: 500, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name}</span>}
              <ChevronDown size={14} color="#7D8692" />
            </button>

            {bell && (
              <div role="dialog" aria-label="Stock alerts" style={{ ...popup, width: 'min(340px, calc(100vw - 24px))', overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #2C333D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Stock alerts</div>
                  <div style={{ fontSize: 12, color: '#7D8692' }}>{outN} out · {flagged.length - outN} low</div>
                </div>
                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                  {flagged.slice(0, 8).map(p => (
                    <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderBottom: '1px solid #262C35' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.stock <= 0 ? '#F2545B' : '#F5B83D', marginTop: 6, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: '#9AA3AE' }}>
                          {p.stock <= 0 ? `Out of stock · min ${p.minStock}` : `${p.stock} left · min ${p.minStock} · ~${(p.stock / Math.max(p.dailySales, 0.01)).toFixed(0)} days of cover`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
                  <button className="hv" onClick={() => go('restock')} style={{ '--hbg': '#B5F04F', flex: 1, height: 34, border: 'none', borderRadius: 6, background: '#A3E635', color: '#15191F', fontWeight: 600, fontSize: 13 }}>Open Restock Optimizer</button>
                  <button className="hv" onClick={() => go('inventory')} style={{ '--hbg': '#2A313B', height: 34, padding: '0 12px', border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13 }}>Inventory</button>
                </div>
              </div>
            )}

            {profile && (
              <div role="menu" style={{ ...popup, width: 240, padding: 6 }}>
                <div style={{ padding: '10px 10px 12px', borderBottom: '1px solid #2C333D', marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name}</div>
                  <div style={{ fontSize: 12, color: '#7D8692', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.email}</div>
                  <div style={{ marginTop: 6, display: 'inline-flex', fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(163,230,53,0.1)', color: '#A3E635' }}>{(ROLES[me.role] || {}).label || me.role}</div>
                </div>
                <button role="menuitem" className="hv" onClick={() => { setAbout(true); setProfile(false); }} style={{ '--hbg': '#2A313B', width: '100%', display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 10px', border: 'none', borderRadius: 5, background: 'none', fontSize: 13, textAlign: 'left' }}>
                  <Info size={15} color="#9AA3AE" />About this prototype
                </button>
                <button role="menuitem" className="hv" onClick={reloadData} style={{ '--hbg': '#2A313B', width: '100%', display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 10px', border: 'none', borderRadius: 5, background: 'none', fontSize: 13, textAlign: 'left' }}>
                  <RefreshCw size={15} color="#9AA3AE" />Reload data
                </button>
                <button role="menuitem" className="hv" onClick={signOut} style={{ '--hbg': 'rgba(242,84,91,0.1)', width: '100%', display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 10px', border: 'none', borderRadius: 5, background: 'none', fontSize: 13, textAlign: 'left', color: '#F2545B' }}>
                  <LogOut size={15} />Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main style={{ flex: 1, width: '100%', maxWidth: 1480, margin: '0 auto', padding: mobile ? '16px 14px 40px' : '24px 28px 48px' }}>
          {loadState.error && !products.length
            ? <ErrorBox title="Couldn’t load inventory from the server" error={loadState.error} onRetry={refresh} />
            : loadState.loading && !products.length && dataVersion === 0
              ? <Spinner label="Loading UnitWorks…" style={{ padding: '40px 0' }} />
              : <Page page={cur} products={products} build={build} api={api} vw={vw} dataVersion={dataVersion} />}
        </main>
      </div>

      {compact && drawer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
          <div onClick={() => setDrawer(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,10,13,0.6)' }} />
          <aside aria-label="Navigation" style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 'min(300px, 86vw)', background: '#1A1F26', borderRight: '1px solid #2C333D', display: 'flex', flexDirection: 'column', animation: 'uwin .16s ease-out' }}>
            <div style={{ height: 60, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 0 20px', borderBottom: '1px solid #262C35' }}>
              <Logo /><div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', flex: 1 }}><Wordmark /></div>
              <button className="hv" onClick={() => setDrawer(false)} aria-label="Close navigation" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 6, background: 'none' }}><X size={18} /></button>
            </div>
            <nav style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflow: 'auto' }}><NavList big /></nav>
            <div style={{ padding: '14px 20px', borderTop: '1px solid #262C35', fontSize: 12, color: '#7D8692', lineHeight: 1.5 }}>Database-backed demo with illustrative seed data.</div>
          </aside>
        </div>
      )}

      {confirm && (() => {
        const danger = !!confirm.danger, Ic = danger ? TriangleAlert : CircleHelp, c = danger ? '#F2545B' : '#A3E635';
        return (
          <div style={{ ...modalWrap, zIndex: 120 }}>
            <div onClick={() => setConfirm(null)} style={scrim} />
            <div role="alertdialog" aria-modal="true" aria-label={confirm.title} style={{ position: 'relative', width: 'min(440px, 100%)', background: '#1F252D', border: '1px solid #333B46', borderRadius: 10, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: 20, animation: 'uwin .16s ease-out' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 34, height: 34, borderRadius: 7, display: 'grid', placeItems: 'center', flexShrink: 0, background: danger ? 'rgba(242,84,91,0.12)' : 'rgba(163,230,53,0.12)', color: c }}><Ic size={17} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{confirm.title}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: '#AEB5BE', textWrap: 'pretty' }}>{confirm.body}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                <button className="hv" onClick={() => setConfirm(null)} style={{ '--hbg': '#2A313B', height: 38, padding: '0 14px', border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13, fontWeight: 500 }}>Cancel</button>
                <button onClick={doConfirm} style={{ height: 38, padding: '0 14px', border: 'none', borderRadius: 6, background: c, color: '#15191F', fontSize: 13, fontWeight: 600 }}>{confirm.confirmLabel || 'Confirm'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {about && (
        <div style={{ ...modalWrap, zIndex: 110 }}>
          <div onClick={() => setAbout(false)} style={scrim} />
          <div role="dialog" aria-modal="true" aria-label="About this prototype" style={{ position: 'relative', width: 'min(520px, 100%)', maxHeight: 'calc(100vh - 32px)', overflow: 'auto', background: '#1F252D', border: '1px solid #333B46', borderRadius: 10, padding: 22, animation: 'uwin .16s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>About this prototype</div>
              <button className="hv" onClick={() => setAbout(false)} aria-label="Close" style={{ '--hbg': '#2A313B', width: 34, height: 34, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 6, background: 'none' }}><X size={17} /></button>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#AEB5BE', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0 }}>UnitWorks is a PC component compatibility and inventory optimization system. The React app talks to an Express API, which stores data in a Supabase PostgreSQL database and runs the optimization algorithms on the server.</p>
              <p style={{ margin: 0 }}>Product names, prices (₱), stock levels, sales rates, and supplier lead times are illustrative. They are not verified live inventory, specifications, or market pricing. They come from an explicit demo seed. No specification service or supplier API is connected.</p>
              <p style={{ margin: 0 }}>Algorithms: Backtracking powers the PC Builder compatibility search, Dynamic Programming powers the Build Optimizer, and a Greedy strategy powers the Restock Optimizer. Inventory changes, saved builds, optimizer runs, and restock plans are stored in the database. Access requires a Supabase Auth account with a role assigned by an administrator; the API checks the role on every request.</p>
            </div>
          </div>
        </div>
      )}

      <div aria-live="polite" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 140, display: 'flex', flexDirection: 'column', gap: 8, width: 'min(360px, calc(100vw - 32px))' }}>
        {toasts.map(t => {
          const { Icon, color } = TOAST[t.type] || TOAST.info;
          return (
            <div key={t.id} role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 12px 12px 14px', background: '#232932', border: '1px solid #333B46', borderRadius: 8, boxShadow: '0 12px 30px rgba(0,0,0,0.4)', animation: 'uwin .18s ease-out' }}>
              <Icon size={17} color={color} style={{ marginTop: 1, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: '#AEB5BE', lineHeight: 1.45 }}>{t.msg}</div>
              </div>
              <button className="hv" onClick={() => setToasts(l => l.filter(x => x.id !== t.id))} aria-label="Dismiss" style={{ '--hbg': '#2A313B', width: 26, height: 26, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 5, background: 'none', color: '#7D8692' }}><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
