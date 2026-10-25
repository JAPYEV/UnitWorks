import React, { useState } from 'react';
import { Icon, Logo, Wordmark, field, mono } from '../components/ui.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { usePending } from '../hooks/useAsync.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Supabase Auth error → message for people (never echoes server internals)
function friendly(err) {
  const code = err && (err.code || err.name);
  const msg = (err && err.message) || '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return 'This account’s email address has not been confirmed. Ask an administrator to confirm it in Supabase.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || err?.status === 429) return 'Too many sign-in attempts. Wait a minute and try again.';
  if (code === 'user_banned') return 'This account has been suspended. Contact an administrator.';
  if (err?.status === 0 || /fetch|network/i.test(msg)) return 'Cannot reach the sign-in service. Check your internet connection.';
  return 'Sign-in failed. Try again, or contact an administrator if this continues.';
}

export function AuthCard({ children, width = 400 }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: '#15191F' }}>
      <div style={{ width: `min(${width}px, 100%)`, display: 'flex', flexDirection: 'column', gap: 18, animation: 'uwin .2s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
          <Logo size={28} /><div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}><Wordmark /></div>
        </div>
        <div style={{ background: '#1C2129', border: '1px solid #2A313B', borderRadius: 10, padding: 22 }}>{children}</div>
        <div style={{ fontSize: 11.5, color: '#6B7480', textAlign: 'center', lineHeight: 1.5 }}>PC component compatibility and inventory optimization</div>
      </div>
    </div>
  );
}

export default function Login() {
  const { signIn, notice, configError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [pending, run] = usePending();

  const submit = e => {
    e.preventDefault();
    const errs = {};
    if (!email.trim()) errs.email = 'Enter your email address.';
    else if (!EMAIL.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Enter your password.';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    run(async () => {
      try { await signIn(email.trim(), password); }
      catch (err) { setFormError(friendly(err)); setPassword(''); }
    });
  };

  const input = invalid => ({ ...field, height: 42, width: '100%', fontSize: 14, border: `1px solid ${invalid ? '#F2545B' : '#333B46'}`, paddingLeft: 36 });
  const label = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#C3C9D0', fontWeight: 500 };

  return (
    <AuthCard>
      <form onSubmit={submit} noValidate aria-label="Sign in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Sign in</h1>
          <div style={{ fontSize: 12.5, color: '#7D8692', marginTop: 4 }}>Use the account an administrator created for you.</div>
        </div>

        {configError && <Banner tone="error" icon="shield-alert">{configError}</Banner>}
        {notice && !formError && <Banner tone="warn" icon="info">{notice}</Banner>}
        {formError && <Banner tone="error" icon="circle-x" role="alert">{formError}</Banner>}

        <label style={label}>Email
          <span style={{ position: 'relative' }}>
            <Icon name="mail" size={15} color="#7D8692" style={{ position: 'absolute', left: 12, top: 13 }} />
            <input className="f-acc" type="email" autoComplete="username" value={email} onChange={e => { setEmail(e.target.value); setErrors(x => ({ ...x, email: null })); }}
              aria-invalid={errors.email ? 'true' : 'false'} disabled={pending || !!configError} placeholder="you@example.com" style={input(errors.email)} autoFocus />
          </span>
          {errors.email && <span style={{ fontSize: 12, color: '#F2545B', fontWeight: 400 }}>{errors.email}</span>}
        </label>

        <label style={label}>Password
          <span style={{ position: 'relative' }}>
            <Icon name="lock" size={15} color="#7D8692" style={{ position: 'absolute', left: 12, top: 13 }} />
            <input className="f-acc" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setErrors(x => ({ ...x, password: null })); }}
              aria-invalid={errors.password ? 'true' : 'false'} disabled={pending || !!configError} style={{ ...input(errors.password), paddingRight: 42, fontFamily: show ? mono : 'inherit' }} />
            <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 4, top: 4, width: 34, height: 34, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 5, background: 'none', color: '#9AA3AE' }}>
              <Icon name={show ? 'eye-off' : 'eye'} size={16} />
            </button>
          </span>
          {errors.password && <span style={{ fontSize: 12, color: '#F2545B', fontWeight: 400 }}>{errors.password}</span>}
        </label>

        <button type="submit" className="h-bg" disabled={pending || !!configError}
          style={{ '--hbg': '#B5F04F', height: 42, border: 'none', borderRadius: 6, background: '#A3E635', color: '#15191F', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pending || configError ? 0.7 : 1 }}>
          {pending && <span style={{ width: 14, height: 14, border: '2px solid rgba(21,25,31,0.3)', borderTopColor: '#15191F', borderRadius: '50%', animation: 'uwspin .8s linear infinite' }} />}
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        <div style={{ fontSize: 12, color: '#7D8692', lineHeight: 1.5 }}>There is no public sign-up. Accounts and roles are set up by an administrator.</div>
      </form>
    </AuthCard>
  );
}

export function Banner({ tone, icon, children, role }) {
  const c = tone === 'error' ? ['#F2545B', 'rgba(242,84,91,0.08)', 'rgba(242,84,91,0.35)'] : ['#F5B83D', 'rgba(245,184,61,0.08)', 'rgba(245,184,61,0.35)'];
  return (
    <div role={role || 'status'} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 7, border: `1px solid ${c[2]}`, background: c[1], fontSize: 12.5, color: '#E6E9ED', lineHeight: 1.5 }}>
      <Icon name={icon} size={16} color={c[0]} style={{ marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}
