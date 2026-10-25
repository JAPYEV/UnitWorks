import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, authConfigError } from '../lib/supabase.js';
import { authApi, configureApiAuth } from '../services/api.js';
import { resetPageStore } from '../components/ui.jsx';

/*
 * Session lifecycle:
 *   loading  → restoring a saved session on page load
 *   signedOut → show the login page (optionally with a notice, e.g. "session expired")
 *   checking → have a Supabase session; asking the API who we are (GET /api/me)
 *   signedIn → the API verified the token and returned our database role + permissions
 *   noAccess → signed in to Supabase, but the API refused (no role yet, or account disabled)
 *   error    → could not reach the API to confirm the session
 * The role shown in the UI always comes from the API, never from the token or local storage.
 */
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const NOTICES = {
  session_expired: 'Your session has expired. Sign in again to continue.',
  invalid_token: 'Your session is no longer valid. Sign in again to continue.',
  signed_out: 'You have been signed out.'
};

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: authConfigError ? 'signedOut' : 'loading', me: null, error: null, notice: null });
  const checkingFor = useRef(null);

  const confirmWithApi = useCallback(async session => {
    if (!session) { checkingFor.current = null; setState(s => ({ ...s, status: 'signedOut', me: null, error: null })); return; }
    if (checkingFor.current === session.user.id) return; // already confirmed for this user
    checkingFor.current = session.user.id;
    setState(s => ({ ...s, status: 'checking', error: null }));
    try {
      const me = await authApi.me();
      setState({ status: 'signedIn', me, error: null, notice: null });
    } catch (e) {
      if (e.status === 401) return; // handled by the unauthorized handler (signs out with a notice)
      checkingFor.current = null;
      if (e.status === 403) setState({ status: 'noAccess', me: null, error: e, notice: null });
      else setState({ status: 'error', me: null, error: e, notice: null });
    }
  }, []);

  const signOut = useCallback(async (reason = 'signed_out') => {
    checkingFor.current = null;
    if (reason === 'signed_out' || reason === null) {
      // Deliberate sign-out: don't leave this user's screens or PC Builder draft for the next person
      resetPageStore();
      try { localStorage.removeItem('unitworks.build-draft.v1'); } catch { /* storage unavailable */ }
    }
    setState({ status: 'signedOut', me: null, error: null, notice: reason ? NOTICES[reason] || null : null });
    try { await supabase?.auth.signOut({ scope: 'local' }); } catch { /* already signed out */ }
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    // Every API request carries the current (auto-refreshed) access token; a 401 ends the session.
    configureApiAuth({
      getToken: async () => (await supabase.auth.getSession()).data.session?.access_token || null,
      onUnauthorized: code => signOut(code === 'session_expired' ? 'session_expired' : 'invalid_token')
    });
    supabase.auth.getSession().then(({ data }) => confirmWithApi(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer: Supabase recommends not awaiting other auth calls inside this callback.
      setTimeout(() => {
        if (event === 'SIGNED_OUT' || !session) { checkingFor.current = null; setState(s => (s.status === 'signedOut' ? s : { ...s, status: 'signedOut', me: null })); }
        else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') confirmWithApi(session);
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [confirmWithApi, signOut]);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) throw new Error(authConfigError);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await confirmWithApi(data.session);
  }, [confirmWithApi]);

  const retry = useCallback(async () => {
    checkingFor.current = null;
    const { data } = await supabase.auth.getSession();
    confirmWithApi(data.session);
  }, [confirmWithApi]);

  const value = useMemo(() => ({
    ...state,
    configError: authConfigError,
    can: permission => !!state.me && state.me.permissions.includes(permission),
    signIn, signOut, retry
  }), [state, signIn, signOut, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
