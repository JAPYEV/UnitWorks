import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `fn` whenever `deps` change and tracks { data, error, loading }. Responses from
 * superseded runs are ignored, so fast filter changes never show stale results.
 * `reload()` re-runs it on demand.
 */
export function useAsync(fn, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState(s => ({ ...s, loading: true, error: null }));
    return fn().then(
      data => { if (id === seq.current) setState({ data, error: null, loading: false }); return data; },
      error => { if (id === seq.current) setState(s => ({ ...s, error, loading: false })); }
    );
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (enabled) run(); }, [run, enabled]);
  return { ...state, reload: run, setData: d => setState(s => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

/** Wraps an async action with a pending flag that blocks duplicate submissions. */
export function usePending() {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const run = useCallback(async fn => {
    if (busy.current) return undefined;
    busy.current = true; setPending(true);
    try { return await fn(); } finally { busy.current = false; setPending(false); }
  }, []);
  return [pending, run];
}
