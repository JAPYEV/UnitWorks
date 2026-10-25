import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App.jsx';
import { FixtureAuthContext } from '../src/auth/AuthProvider.jsx';
import { configureApiAuth } from '../src/services/api.js';
import '../src/styles.css';

function Fixture() {
  const [me,setMe]=useState(null),[error,setError]=useState('');
  const role=new URLSearchParams(location.search).get('role')==='staff'?'staff':'admin';
  useEffect(()=>{
    fetch('/__fixture/session?role='+role).then(r=>r.json()).then(s=>{
      configureApiAuth({getToken:async()=>s.token,onUnauthorized:()=>setError('Fixture session expired; restart the rehearsal.')});
      setMe(s.me);
    }).catch(()=>setError('Could not start the isolated fixture.'));
  },[role]);
  return <>
    <div style={{padding:'10px 16px',background:'#252C20',color:'#E6E9ED',fontSize:12,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
      <strong>Isolated rehearsal · temporary data only</strong>
      <label>Fixture role <select aria-label="Fixture role" value={role} onChange={e=>{localStorage.removeItem('unitworks.build-draft.v1');location.href='/?role='+e.target.value;}} style={{background:'#15191F',border:'1px solid #6F8F3E',borderRadius:4,padding:5}}>
        <option value="admin">Administrator</option><option value="staff">Staff</option>
      </select></label>
      <a href="/__fixture/evidence" target="_blank" rel="noreferrer">Saved-value evidence</a>
    </div>
    {error?<div role="alert" style={{padding:24}}>{error}</div>:me?<FixtureAuthContext.Provider value={{me,can:p=>me.permissions.includes(p),signOut:()=>{location.href='/?role=staff';}}}><App /></FixtureAuthContext.Provider>:<p role="status">Starting disposable fixture…</p>}
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
