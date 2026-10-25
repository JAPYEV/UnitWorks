// Loopback-only browser rehearsal. Never loads env files or production credentials.
// Actual App/pages and Express permissions; only Supabase identity acquisition is replaced
// by the existing test harness's locally signed fixture identities.
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { startApi } from '../../Backend/test/helpers.js';

if (process.env.DATABASE_URL) throw new Error('Run this fixture without DATABASE_URL in the environment.');
const api = await startApi();
const requestEvidence = [];
let lastRecommendations = null;
const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  root, configFile: false, envFile: false, logLevel: 'error',
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
  resolve: { alias: { '@shared': fileURLToPath(new URL('../../shared', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5188, strictPort: true, fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } },
  plugins: [tailwindcss(), {
    name: 'isolated-fixture-auth-context', enforce: 'pre',
    load(id) {
      if (id.replaceAll('\\', '/').split('?')[0].endsWith('/src/auth/AuthProvider.jsx')) {
        return `import {createContext,useContext} from 'react';
          export const FixtureAuthContext=createContext(null);
          export const useAuth=()=>useContext(FixtureAuthContext);`;
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1:5188');
        const json = (status, data) => { res.statusCode=status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(data)); };
        try {
          if (url.pathname === '/__fixture/session') {
            const role = url.searchParams.get('role');
            if (!['admin','staff'].includes(role)) return json(422, {error:'Choose an existing fixture identity.'});
            const me = await api.get('/me', role);
            return json(200, { token:api.tokens[role], me:me.body.data });
          }
          if (url.pathname === '/__fixture/evidence') {
            const runs=(await api.db.query(`select id,budget,use_case,priority_graphics,priority_processing,priority_memory,total_price,score,build_id from optimization_runs order by created_at,id`)).rows;
            const components=(await api.db.query('select build_id,category_key,item_id,is_integrated_graphics,unit_price from pc_build_components order by build_id,category_key')).rows;
            const ledgerMismatches=(await api.db.query('select id from inventory_stock_audit where difference<>0')).rows.length;
            return json(200,{ scope:'disposable-in-memory-fixture',catalog:'44 illustrative seed products',runs,components,ledgerMismatches,requests:requestEvidence,recommendations:lastRecommendations });
          }
          if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
            let text=''; for await (const chunk of req) { text+=chunk; if(text.length>100000) return json(413,{error:'Fixture request too large'}); }
            const body=text?JSON.parse(text):undefined;
            const bearer=/^Bearer (.+)$/.exec(req.headers.authorization||'');
            const response=await api.call(req.method,url.pathname.slice(4)+url.search,body,bearer?{token:bearer[1]}:null);
            if (req.method !== 'GET') requestEvidence.push({method:req.method,path:url.pathname,status:response.status,input:body});
            if (url.pathname==='/api/optimizer/recommendations'&&response.status===200) {
              const out=response.body.data;
              lastRecommendations=[{key:'rec',input:out.input,selection:out.rec.sel,total:out.rec.total},...out.alts.map(a=>({key:a.key,input:a.input,selection:a.r.sel,total:a.r.total}))];
            }
            if(response.status===204){res.statusCode=204;return res.end();}
            return json(response.status,response.body);
          }
          if (url.pathname === '/') {
            res.setHeader('Content-Type','text/html');
            return res.end(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UnitWorks — isolated rehearsal</title></head><body><div id="root"></div><script type="module" src="/test/manual-demo.jsx"></script></body></html>`);
          }
          next();
        } catch(e) { json(500,{error:'Fixture request failed',code:e.code||e.name}); }
      });
    }
  }]
});
await vite.listen();
console.log('UnitWorks isolated browser rehearsal: http://127.0.0.1:5188/');
console.log('Database: disposable PGlite; catalog: 44 illustrative seed products; production env: not loaded.');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await vite.close();await api.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
