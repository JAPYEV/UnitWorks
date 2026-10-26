# Deploy UnitWorks as one Vercel project

The existing Frontend, Backend, and shared folders stay in place. Vercel serves
Frontend/dist and sends /api/* to api/index.js, which initializes the Express app.
The frontend already defaults to /api and attaches the Supabase session token.

## 1. Push the complete repository

Push the source, api/index.js, vercel.json, and both package-lock.json files to
your Git provider. Do not commit real .env files or credentials.

## 2. Import into Vercel

Choose Add New > Project and import the repository. Use:

| Setting | Value |
| --- | --- |
| Root Directory | Repository root (leave blank or use ./) |
| Framework Preset | Other |
| Node.js Version | 22.x |
| Install Command | Supplied by vercel.json |
| Build Command | Supplied by vercel.json: npm run build |
| Output Directory | Supplied by vercel.json: Frontend/dist |

Do not choose Frontend or Backend as the root directory. No start command is needed.

## 3. Add environment variables before deploying

Select Production for the live site. Enable Preview too only if previews should
use the same database and authentication project; otherwise use a separate test project.

| Variable | Value |
| --- | --- |
| DB_DRIVER | postgres |
| DATABASE_URL | Supabase Connect > Transaction pooler URI (normally port 6543), with your database password |
| DATABASE_SSL | true |
| SUPABASE_URL | https://YOUR-PROJECT-REF.supabase.co |
| VITE_SUPABASE_URL | The same Supabase project URL |
| VITE_SUPABASE_PUBLISHABLE_KEY | Your Supabase publishable key (sb_publishable_...) |
| VITE_API_URL | /api |

Vercel does not get these values from your uncommitted local .env files. All
VITE_ values are public browser configuration: never put DATABASE_URL, database
passwords, secret keys, or service-role keys in them. Use the pooler URI copied
from Supabase and URL-encode special characters in its password.

Requests use the same origin, so a production CORS_ORIGIN value is not required.
The local development commands and Vite proxy still work as before.

## 4. Prepare the database only if needed

If the existing Supabase database and account already work locally, use that same
project; do not seed it again for deployment. Vercel builds do not run migrations.

For a fresh database, first configure Backend/.env from Backend/.env.example,
using a direct or session-pooler database connection for local administration.
Run from the repository root:

```powershell
npm run install:all
npm run db:migrate
```

Only if you want sample inventory in that database, run npm run db:seed.
Use the same migration method previously used for an existing database; do not
switch between the project's runner and manually applied SQL migrations.

Create an account in Supabase > Authentication > Users if needed, then grant its role:

```powershell
npm --prefix Backend run users -- grant --email you@example.com --role admin
```

## 5. Deploy and verify

Click Deploy. At your assigned domain, open /api/health. Expected JSON:

```json
{"data":{"status":"ok","database":"up"}}
```

Open the site root, sign in, and check Dashboard and Inventory. In browser Network
tools, API requests should go to the same site's /api/... URLs.

| Symptom | Check |
| --- | --- |
| Build fails | Build logs; repository root; both committed lockfiles |
| Function fails to start | Runtime logs; DATABASE_URL and SUPABASE_URL |
| Health returns 503 | Pooler URI, password, database availability and network restrictions |
| API returns HTML | Correct root directory and committed vercel.json |
| 401 from protected API | Sign in; check both Supabase URL settings refer to the same project |
| 403 after sign-in | Grant an active UnitWorks admin or staff role |
| Login configuration missing | Set both VITE_SUPABASE variables and redeploy |

After changing environment variables, redeploy. VITE_ settings are compiled at build time.

References: [Vercel Functions with Vite](https://vercel.com/docs/frameworks/frontend/vite),
[Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json),
[Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
