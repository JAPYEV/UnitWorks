// Supabase client used ONLY for authentication (sign-in, session persistence, token refresh).
// All application data goes through the Express API; the browser has no table access (RLS + revoked
// grants), so this client never reads or writes UnitWorks data directly.
//
// Uses the project's publishable key (or the legacy anon key). Never put a service-role/secret key,
// database password or connection string in the frontend.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

const looksSecret = k => /^sb_secret_/.test(k) || (() => {
  try { return JSON.parse(atob(k.split('.')[1])).role === 'service_role'; } catch { return false; }
})();

export const authConfigError = !url || !key
  ? 'Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Frontend/.env, then restart the dev server.'
  : looksSecret(key)
    ? 'Frontend/.env contains a secret (service-role) key. Replace it with the publishable key and rotate the secret key in Supabase.'
    : null;

export const supabase = authConfigError ? null : createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'unitworks.auth' }
});
