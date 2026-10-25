import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Box, Briefcase, EyeOff, LogOut, Lock, Mail, ShieldAlert, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  CircleCheck, CircleDashed, CircleHelp, CircleMinus, CircleX, CircuitBoard, Clapperboard, Code, Cpu, Eye, Fan, FileText,
  Gamepad2, GitBranch, HardDrive, Info, ListOrdered, MemoryStick, Monitor, Package, PackageCheck, PackagePlus, Pencil,
  Play, Plus, RefreshCw, RotateCcw, Save, Search, SearchX, ShieldCheck, ShoppingCart, SlidersHorizontal, Sparkles, Table2, Trash2,
  TriangleAlert, Truck, Undo2, Wallet, X, Zap
} from 'lucide-react';

export const mono = "'Geist Mono',monospace";

/* Lucide icons by the design's kebab-case `icon-<name>` names. Add new ones here. */
const ICONS = {
  'eye-off': EyeOff, 'log-out': LogOut, lock: Lock, mail: Mail, 'shield-alert': ShieldAlert,
  'arrow-down': ArrowDown, 'arrow-right': ArrowRight, 'arrow-up': ArrowUp, 'arrow-up-down': ArrowUpDown, box: Box, briefcase: Briefcase,
  'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, 'chevron-up': ChevronUp,
  'circle-check': CircleCheck, 'circle-dashed': CircleDashed, 'circle-help': CircleHelp, 'circle-minus': CircleMinus, 'circle-x': CircleX,
  'circuit-board': CircuitBoard, clapperboard: Clapperboard, code: Code, cpu: Cpu, eye: Eye, fan: Fan, 'file-text': FileText,
  'gamepad-2': Gamepad2, 'git-branch': GitBranch, 'hard-drive': HardDrive, info: Info, 'list-ordered': ListOrdered, 'memory-stick': MemoryStick,
  monitor: Monitor, package: Package, 'package-check': PackageCheck, 'package-plus': PackagePlus, pencil: Pencil, play: Play, plus: Plus,
  'refresh-cw': RefreshCw, 'rotate-ccw': RotateCcw, save: Save, search: Search, 'search-x': SearchX, 'shield-check': ShieldCheck, 'shopping-cart': ShoppingCart,
  'sliders-horizontal': SlidersHorizontal, sparkles: Sparkles, 'table-2': Table2, 'trash-2': Trash2, 'triangle-alert': TriangleAlert,
  truck: Truck, 'undo-2': Undo2, wallet: Wallet, x: X, zap: Zap
};
export function Icon({ name, size = 16, color, style }) {
  const C = ICONS[name];
  if (!C) return null;
  return <C size={size} color={color} style={{ flexShrink: 0, ...style }} aria-hidden="true" />;
}

/* Page state that survives navigating away and back (the design's window.__uwPS).
   `set` merges a partial object, or a function of the current state returning one. */
const pageStore = {};
/** Forget per-page state (e.g. on sign-out, so the next user starts clean). */
export const resetPageStore = () => { for (const k of Object.keys(pageStore)) delete pageStore[k]; };
export function usePageState(name, init, persist = s => s) {
  const [s, setS] = useState(() => pageStore[name] || (typeof init === 'function' ? init() : init));
  useEffect(() => { pageStore[name] = persist(s); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback(p => setS(cur => ({ ...cur, ...(typeof p === 'function' ? p(cur) : p) })), []);
  return [s, set];
}

/* Shared surfaces */
export const card = { background: '#1C2129', border: '1px solid #2A313B', borderRadius: 8 };
export const btnSecondary = { height: 36, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13 };
export const btnPrimary = { height: 36, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 6, background: '#A3E635', color: '#15191F', fontSize: 13, fontWeight: 600 };
export const field = { height: 40, border: '1px solid #333B46', borderRadius: 6, background: '#14181E', padding: '0 10px', fontSize: 13, outline: 'none' };
export const eyebrow = { fontFamily: mono, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B7480' };
export const hvSecondary = { className: 'h-bg', '--hbg': '#2A313B' };

export function Pill({ color, bg, children, dot, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 4, background: bg, color, fontSize: 12, whiteSpace: 'nowrap', ...style }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />}{children}
    </span>
  );
}

export function Modal({ onClose, label, width, pad = 20, children, as = 'div', onSubmit, role = 'dialog' }) {
  const Box = as;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', padding: pad }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(8,10,13,0.66)' }} />
      <Box onSubmit={onSubmit} role={role} aria-modal="true" aria-label={label}
        style={{ position: 'relative', width: `min(${width}px, 100%)`, maxHeight: 'calc(100vh - 24px)', display: 'flex', flexDirection: 'column', overflow: 'auto', background: '#1F252D', border: '1px solid #333B46', borderRadius: 10, animation: 'uwin .16s ease-out' }}>
        {children}
      </Box>
    </div>
  );
}

export function CloseBtn({ onClick, size = 36 }) {
  return (
    <button type="button" className="h-bg" onClick={onClick} aria-label="Close"
      style={{ '--hbg': '#2A313B', width: size, height: size, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 6, background: 'none', flexShrink: 0 }}>
      <Icon name="x" size={17} />
    </button>
  );
}

export function Select({ value, onChange, options, style, ...rest }) {
  return (
    <select value={value} onChange={onChange} style={{ ...field, ...style }} {...rest}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* Request states shared by every page */
export function Spinner({ label, style }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#9AA3AE', fontSize: 13, ...style }}>
      <span style={{ width: 16, height: 16, border: '2px solid #333B46', borderTopColor: '#A3E635', borderRadius: '50%', animation: 'uwspin .8s linear infinite', flexShrink: 0 }} />{label}
    </div>
  );
}

export function ErrorBox({ title = 'Something went wrong', error, onRetry, style }) {
  return (
    <div role="alert" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '14px 16px', border: '1px solid rgba(242,84,91,0.35)', background: 'rgba(242,84,91,0.08)', borderRadius: 8, ...style }}>
      <Icon name="circle-x" size={18} color="#F2545B" />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: '#AEB5BE' }}>{error ? error.message || String(error) : 'Unknown error.'}</div>
      </div>
      {onRetry && <button className="h-bg" onClick={onRetry} style={{ ...btnSecondary, '--hbg': '#2A313B', height: 34 }}>Retry</button>}
    </div>
  );
}

export const skeleton = h => ({ height: h, borderRadius: 8, background: '#1C2129', border: '1px solid #262C35', animation: 'uwpulse 1.2s ease-in-out infinite' });

/** Indent per search-tree level in trace views: tighter on phones so deep levels stay readable. */
export const traceIndent = () => (typeof window !== 'undefined' && window.innerWidth < 640 ? 6 : 14);

/* UnitWorks brand mark, shared by the app shell and the sign-in screens */
export const Logo = ({ size = 24 }) => (
  <div style={{ width: size, height: size, border: '1.5px solid #A3E635', borderRadius: 5, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
    <div style={{ width: size * 0.375, height: size * 0.375, background: '#A3E635', borderRadius: 2 }} />
  </div>
);
export const Wordmark = () => <>Unit<span style={{ fontWeight: 500, color: '#9AA3AE' }}>Works</span></>;
