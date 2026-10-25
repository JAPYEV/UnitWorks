import React from 'react';
import { useAuth } from './AuthProvider.jsx';
import Login, { AuthCard, Banner } from '../pages/Login.jsx';
import { Icon, Spinner } from '../components/ui.jsx';

const btn = { height: 38, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px solid #333B46', borderRadius: 6, background: '#232932', fontSize: 13 };

/** Renders the app only for users the API has confirmed; everything else gets a sign-in screen. */
export default function AuthGate({ children }) {
  const { status, error, signOut, retry } = useAuth();

  if (status === 'loading' || status === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#15191F' }}>
        <Spinner label={status === 'loading' ? 'Restoring your session…' : 'Checking your access…'} />
      </div>
    );
  }
  if (status === 'signedOut') return <Login />;
  if (status === 'noAccess' || status === 'error') {
    return (
      <AuthCard width={440}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{status === 'noAccess' ? 'No access yet' : 'Couldn’t confirm your session'}</h1>
          <Banner tone={status === 'noAccess' ? 'warn' : 'error'} icon={status === 'noAccess' ? 'lock' : 'circle-x'} role="alert">
            {error ? error.message : 'Something went wrong.'}
          </Banner>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="h-bg" onClick={retry} style={{ ...btn, '--hbg': '#2A313B' }}><Icon name="refresh-cw" size={14} />Try again</button>
            <button className="h-bg" onClick={() => signOut(null)} style={{ ...btn, '--hbg': '#2A313B' }}><Icon name="log-out" size={14} />Sign out</button>
          </div>
        </div>
      </AuthCard>
    );
  }
  return children;
}
