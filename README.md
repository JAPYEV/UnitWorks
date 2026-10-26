# UnitWorks

Deploy the frontend and API together: [single-project Vercel setup](docs/VERCEL_DEPLOYMENT.md).

UnitWorks is a PC component compatibility and inventory optimization system for a computer parts shop. It combines inventory management with three algorithms:

| Feature | Algorithm | What it answers |
| --- | --- | --- |
| PC Builder | Backtracking | Which complete, compatible builds contain the parts I've already chosen? |
| Build Optimizer | Dynamic programming | What is the best compatible build for this budget and use case? |
| Restock Optimizer | Greedy | Which products should I reorder first with this purchasing budget? |

All demo data is illustrative. Product names are real product lines, but prices, stock levels, sales rates, lead times and performance indices are invented sample values, not live inventory, market pricing or benchmarks.

## Architecture

```
UnitWorks/
├── Frontend/            React 18 + Vite 5 + Tailwind CSS 4, lucide-react (explicit icon imports)
│   └── src/
│       ├── App.jsx          shell: navigation, header alerts, dialogs, toasts, shared state
│       ├── pages/           the six pages
│       ├── components/ui.jsx shared UI (icons, modals, pills, loading/error states)
│       ├── services/api.js  REST client
│       └── hooks/useAsync.js request state + duplicate-submit guard
├── Backend/             Node.js + Express 4
│   ├── src/
│   │   ├── app.js           Express app (CORS, JSON, routes, error handling)
│   │   ├── server.js        startup + config validation
│   │   ├── config.js        environment configuration
│   │   ├── routes/          REST route table
│   │   ├── controllers/     HTTP ↔ service mapping
│   │   ├── services/        validation + business logic + algorithm runs
│   │   ├── repositories/    SQL (parameterized queries, database functions)
│   │   ├── middleware/      central error handler, 404
│   │   └── lib/             db adapter, validation, errors
│   ├── scripts/         migrate, seed, seed generator, demo catalog
│   └── test/            API, database and algorithm tests (node:test)
├── shared/uw-core.js    compatibility rules + the three algorithms, used by backend and frontend
└── supabase/
    ├── migrations/      schema, reference data, functions/triggers, security (RLS)
    └── seed.sql         demo data only (generated)
```

**How the pieces talk.** React calls the Express REST API under `/api`. In development, Vite proxies `/api` to the backend, so the browser stays same-origin. Express is the only component that touches the database. It connects to Supabase PostgreSQL over a server-only connection string (`DATABASE_URL`) using `node-postgres`. This is the "appropriate server-side integration" option rather than the Supabase JS client, chosen so that:

- every stock change can call one atomic Postgres function, and
- the exact same SQL, migrations and API can be tested locally against an embedded Postgres (PGlite) without credentials.

**Where algorithms run.** The backtracking search, the DP optimizer, the greedy restock plan and dashboard statistics run on the server against database records. The frontend imports the same `shared/uw-core.js` only for instant per-part compatibility hints in the PC Builder, which are pure functions over the inventory the page already loaded. Saving a build re-validates it on the server.

**Authentication.** Supabase Auth handles identity, passwords and sessions. The React app uses `@supabase/supabase-js` with the publishable key only to sign in and keep the session. Every API request sends the access token. Express verifies it, looks up the user's role in the database, and checks the permission for that route. See [Authentication and permissions](#authentication-and-permissions).

**What stays in the browser.** Only the in-progress PC Builder selection (an unsaved draft) is kept in `localStorage`. Inventory, movements, saved builds, optimizer runs and restock plans all live in the database. There is no hidden demo-data fallback. If the API fails, the page shows an error with Retry.

## Pages

1. **Dashboard:** totals, inventory value, stock health by category, critical restocking alerts, recent stock movements and top-demand components, all computed by `GET /api/dashboard`.
2. **PC Builder:** pick one part per category. Every option shows live compatibility against the parts already chosen. Run the backtracking search for complete builds (with trace, pruning statistics and rejection reasons), apply a result, save builds to the database, and load or delete saved builds.
3. **Build Optimizer:** budget, intended use, priorities, brand, memory and stock constraints → recommended build plus three re-optimized alternatives, the DP state table, transition trace and per-platform results. You can save the run (and its build) or open the build in the PC Builder.
4. **Inventory Management:** server-side search, filters, sorting and pagination, plus add, edit and archive products with specifications. Stock adjustments (receive, remove, set count) are recorded as movements.
5. **Restock Optimizer:** the greedy plan for a purchasing budget and coverage target, with ranked decisions, selection sequence, skipped items and a knapsack reference. You can save a plan as a draft or mark it as received, which adds the stock atomically and only once. The page lists saved plans.
6. **Algorithm Analysis:** runs each algorithm on the server and shows inputs, results, traces, the measured server time for that run, and the theoretical complexity derived from the code.

## Algorithms

All three are implemented in `shared/uw-core.js`. None of them return hard-coded results.

### Compatibility rules (11)

Each rule is checked only once every part it involves is chosen:

- CPU socket matches the motherboard.
- RAM generation is supported by the motherboard.
- The case supports the motherboard form factor.
- A display output exists (discrete GPU, or a CPU with integrated graphics).
- The GPU fits in the case.
- The cooler supports the CPU socket.
- The cooler fits in the case (air cooler height, or AIO radiator size).
- The cooler's rating covers the CPU's maximum power.
- The PSU wattage covers the estimated load: `⌈(CPU + GPU + 75 W) × 1.25⌉`, rounded up to 50 W.
- The PSU has the GPU's power connectors.
- The storage interface is supported (M.2 slot or SATA port).

A missing specification makes the rule **unverified**, never assumed compatible.

### Backtracking: PC Builder

- **How it searches.** Categories are assigned in a fixed order (CPU → Motherboard → Memory → Case → Cooler → GPU → PSU → Storage), cheapest candidate first. After each assignment, only the constraints whose parts are all chosen are tested. A failure prunes the branch, and an exhausted category backtracks one level.
- **Budget bound.** A branch is also pruned when its current cost plus the cheapest remaining parts exceeds the budget.
- **What it returns.** Valid builds, explored and pruned counts, rejections by reason, and a step trace.
- **Limits.** It stops after 12 solutions or 40,000 nodes, so results are complete only when the analysis says "Exhaustive for this input".
- **Ordering.** Candidates use price then product ID; returned results are price-sorted. A capped search does not guarantee the globally cheapest K builds. Locks also obey the stock filter.
- **Complexity.** Preparation is O(N log N); search is O(C · Σ_d Π_{i≤d} nᵢ), or O(8 · C · Π nᵢ) for nonempty domains. This is exponential as category count grows. Space includes O(N) candidate storage, O(8) recursion, O(8S) saved selections and O(T) trace.
- **Verified.** The test suite compares the set of builds it finds against brute-force enumeration of all 882,000 combinations.

### Dynamic programming: Build Optimizer

- **Objective.** Maximize `S = Σ w_c · s_c` (category weight × illustrative 0–100 score) subject to: total ≤ budget, exactly one part per category, and all rules pass.
- **Formulation.**
  - Every compatible CPU + motherboard + case "platform" is enumerated.
  - For each platform, the remaining categories become groups of options already filtered for compatibility. GPU and PSU are paired, because PSU validity depends on the GPU.
  - A multiple-choice DP over the groups, `D[i][b] = max_k(D[i−1][b − cost_k] + value_k)`, uses ₱100 budget steps with costs rounded up.
- **Optimality.**
  - The result is exact (optimal) whenever part prices are multiples of ₱100. The tests check this against brute force for three budget/use-case cases.
  - With other prices, the result maximizes the objective in the conservative rounded domain, not necessarily among all builds that fit their actual prices. Four groups add less than four budget steps of rounding per build; there is no claim about how often this affects results or any general score-loss bound. The budget is never exceeded.
  - The optional "prefer unspent budget" penalty is applied per budget state using rounded costs.
  - Scores are additive, so interactions such as CPU bottlenecks are not modeled.
- **Money and ties.** Actual prices/totals use integer cents. Platform cost stays exact, GPU+PSU round together, and other groups round independently. Equal objective values prefer lower actual total, then deterministic ID-ordered traversal. Core allocation rejects budgets over ₱500,000 or more than 20,001 budget states.
- **Complexity.** O(P · G · B · K) for the DP, with catalog ordering O(N log N), platform enumeration O(n_cpu · n_mb · n_case · C), and option preparation O(P · (n_ram+n_cooler+n_storage+n_gpu·n_psu) · C). Space is O(N+G·B+G·K+P). This is pseudo-polynomial in budget/unit; B is the largest per-platform budget-state count, not necessarily the winning table's size.

### Greedy: Restock Optimizer

- **Candidates.** Products at or below their reorder point: `⌈daily × lead + min⌉`, with daily sales > 0.
- **Urgency.** `urgency = round(100 × (0.6 × min(lead ÷ days_left, 3) ÷ 3 + 0.4 × daily ÷ max_daily))`, with `days_left` floored at 0.5 and `max_daily` at least 0.1. Candidates sort by urgency, daily sales, then ascending product ID. Missing/zero demand does not generate an order.
- **Order quantity.** `max(MOQ, ⌈min + daily × (lead + cover)⌉ − stock)`.
- **Funding rule.** In rank order, fund the full order if it fits. Otherwise buy the largest affordable quantity that still meets the MOQ, or skip the item. Every decision carries a reason.
- **MOQ and precision.** MOQ is a minimum, not a pack multiple. Monetary allocation uses integer cents; invalid quantities, costs, demand and derived order values are rejected before selection.
- **Demand data.** Demand is each product's stored average daily sales (`daily_sales`). There is no separate sales-history table.
- **Not optimal.** Greedy never revisits a choice, so one expensive urgent order can crowd out several cheaper ones. A test demonstrates this. A 0/1 knapsack over full orders (costs rounded to ₱100) is computed only as a reference. Its objective differs slightly from greedy's (greedy counts partial orders proportionally).
- **Complexity.** O(N log N+n log n) for catalog/candidate ordering and O(N) for scans, O(N) space. The reference knapsack adds O(nH) time and space, H=floor(budget/100)+1. It is omitted if H exceeds 20,001 or nH exceeds 2,000,000; the greedy plan still runs.

**Empirical vs. theoretical.** The analysis page shows one measured server time per run. That number depends on hardware and load and is not evidence of complexity. The complexity statements above are derived from the code.

## Database (Supabase PostgreSQL)

The schema is in `supabase/migrations/`.

| Table | Purpose |
| --- | --- |
| `component_categories` | The 8 categories (reference data). |
| `spec_definitions` | The spec fields per category, with type (`text`, `number`, `select`), unit and options. |
| `inventory_items` | Products. Money is `numeric(12,2)`; `stock ≥ 0`; `unit_cost ≤ price`; performance indices 0–100. Products are archived (`archived_at`) rather than deleted. Active names are unique, case-insensitive. |
| `component_specs` | One row per known spec value. A composite foreign key pins it to the item's category. A trigger validates numbers and select options. |
| `inventory_movements` | Append-only stock ledger: type, signed quantity, stock after, note, reference, user, timestamp. Sign checks per type (e.g. a Sale must be negative). |
| `pc_builds`, `pc_build_components` | Saved builds, with prices captured at save time and the calculated rule results. Integrated graphics is stored as a flag. |
| `optimization_runs` | Optimizer inputs, the feasibility result, score, total, linked build and DP statistics. |
| `restock_plans`, `restock_plan_items` | Saved greedy plans and their decisions. Checks enforce `total_cost + remaining = budget` and `order_cost = order_qty × unit_cost`. |

**Consistency of stock.**

- Every stock change goes through `adjust_stock()` (or `set_stock_count()`, `receive_items()`, `receive_restock_plan()`, `create_inventory_item()`). These lock the row, update the stock and append a movement in a single transaction.
- A guard trigger rejects any other write to `stock`. Another trigger makes movements immutable.
- So `stock` always equals the sum of the item's movements. The `inventory_stock_audit` view should return no rows with `difference <> 0`.
- Multi-line operations are all-or-nothing. For example, receiving a plan with one archived item applies nothing.

**Indexes:** active name (unique), category, stock/min stock, movements by item and by date, builds/plans/runs by date, and component foreign keys.

**Security and access model.**

- Every API route except `/api/health` requires a verified Supabase session and a role that has the route's permission. See [Authentication and permissions](#authentication-and-permissions).
- Row Level Security is enabled on every table with no policies, and table, sequence and function privileges are revoked from `anon` and `authenticated`. As a result, the public Supabase Data API (anon key) can neither read nor write application data.
- The only path to application data is the Express backend, using the database connection string, which must stay on the server. The frontend bundle contains only the Supabase URL and the publishable key, which can sign users in but cannot read any UnitWorks table.

## Authentication and permissions

**How a request is authorized**

1. The user signs in on the login page. Supabase Auth checks the password and returns a short-lived access token, which is refreshed automatically.
2. The frontend sends `Authorization: Bearer <token>` on every API call.
3. `Backend/src/middleware/auth.js` verifies the token's signature against the project's public signing keys (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`), along with its issuer, its audience (`authenticated`) and its expiry. No secret is needed on the server.
4. It then loads the user's profile from `user_profiles` by the token's `sub`. The role comes **only from the database**. Role-like claims in the token's metadata are ignored, and no request body can set a role.
5. `requirePermission(...)` on each route checks the role against `shared/permissions.js`.

**Status codes**

- `401` — no token, or a malformed, forged, expired, wrong-issuer or wrong-audience token. The frontend signs the user out and shows "session expired" or "not valid".
- `403` — signed in, but no role yet, account disabled, or the role lacks the permission.

**Roles.** These are defined in `shared/permissions.js`, the single place to change them. The API enforces them; the UI only hides controls.

| Permission | Administrator | Staff |
| --- | :-: | :-: |
| View dashboard, inventory, component catalog | ✓ | ✓ |
| Run PC Builder compatibility checks and backtracking search | ✓ | ✓ |
| Run Build Optimizer; view saved builds and runs | ✓ | ✓ |
| Generate restock recommendations; view saved plans; Algorithm Analysis | ✓ | ✓ |
| Add, edit and archive products | ✓ | |
| Receive, remove and count stock | ✓ | |
| View stock movement history (dashboard list, movement endpoints) | ✓ | |
| Save and delete PC builds; save optimizer runs | ✓ | |
| Save restock plans; receive plans into stock | ✓ | |

**Accounts (administrator-provisioned; no public sign-up)**

- Every Supabase Auth account automatically gets a `user_profiles` row with **no role**. A trigger on `auth.users` creates it. Such an account can sign in to Supabase but gets `403 no access` from the API until an administrator assigns a role. So even if public sign-ups were left on in Supabase, a self-registered user could not see or change anything.
- Roles are changed only with the server-side script, which uses the backend's database credentials. There is no API endpoint for it.

**Setting up the first administrator**

1. **Turn off public sign-ups (recommended).** In Supabase, go to **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. Administrators can still add users.
2. **Create the account.** Go to **Authentication → Users → Add user → Create new user**. Enter the email and a strong password, and tick **Auto Confirm User**. No credentials are stored in this repository.
3. **Give it the administrator role** from the project folder:

```bash
npm --prefix Backend run users -- grant --email you@example.com --role admin --name "Your Name"
```

4. **Configure sign-in in the frontend.** Put the **publishable** key (Project Settings → API Keys, `sb_publishable_…`) in `Frontend/.env` as `VITE_SUPABASE_PUBLISHABLE_KEY`, next to `VITE_SUPABASE_URL`. Restart `npm run dev:web` and sign in.

Other account commands:

```bash
npm --prefix Backend run users -- list
```

```bash
npm --prefix Backend run users -- grant --email staff@example.com --role staff
```

`revoke` removes the role (no access). `disable` blocks the account immediately; `enable` restores it. To remove someone, `disable` them rather than deleting the Auth user, so their history stays readable.

**Attribution.** For each write, Express runs one database transaction that first sets `unitworks.actor_id` (and the actor's name) from the verified user, then calls the existing atomic functions. The database fills these from it:

- `inventory_movements.performed_by_user_id` and `performed_by`
- `inventory_items.archived_by`
- `pc_builds.created_by` and `optimization_runs.created_by`
- `restock_plans.created_by` and `received_by`

The setting is transaction-local, so it never leaks to other requests. Stock functions, the stock guard trigger, the append-only ledger and the oversell checks are unchanged.

**Trust boundaries (what to know)**

- **The backend bypasses RLS.** It connects as the `postgres` role, which is not subject to RLS, so **Express is the authorization layer for application data**. RLS (no policies) plus revoked grants only stop browsers from going around Express through the Supabase Data API. Anyone holding `DATABASE_URL` has full database access: keep it on the server.
- **Sign-out doesn't revoke an issued token.** Access tokens stay valid until they expire (Supabase default: 1 hour). Signing out removes the token from the browser, but a copied token still works until expiry. To cut someone off immediately, use `users -- disable` or `revoke`; the API checks the profile on every request.
- **Supabase Auth settings are managed in the Supabase dashboard,** not in this repository: sign-up toggle, password rules, rate limits and token lifetime.

## Setup

### Prerequisites

- Node.js 22.9 or newer. It was developed on Node 24. The backend uses `node --env-file-if-exists`.
- A Supabase project, for the real database. Local development can instead use the embedded PGlite database (no account needed).

### Install

```bash
npm run install:all
```

### Option A: Supabase (the real database)

1. **Create a project** at supabase.com.
2. **Configure the backend.** Copy `Backend/.env.example` to `Backend/.env`. Set `DATABASE_URL` from **Project Settings → Database → Connection string**: use the session pooler (port 5432) or the direct connection, with your database password. Keep `DATABASE_SSL=true`. Set `SUPABASE_URL` to `https://<project-ref>.supabase.co`.
3. **Apply the migrations.** Pick one of these and stick with it, because they keep separate histories:
   - Supabase CLI: `supabase link --project-ref <ref>`, then `supabase db push`.
   - This project's runner: `npm run db:migrate`. It records applied files in `unitworks_meta.applied_migrations`.
   - Or paste the files from `supabase/migrations/` into the SQL Editor, in filename order.
4. **Load the demo data (optional).** Run `npm run db:seed`. It refuses to run if `inventory_items` already has rows, so it never mixes demo data into real data. With the CLI, `supabase db reset` also applies `supabase/seed.sql`; note that it wipes the database.
5. **Create the first administrator and configure sign-in.** Follow [Setting up the first administrator](#authentication-and-permissions).
6. **Start the servers** in two terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Open http://localhost:5173. The API listens on http://localhost:4000. `GET /api/health` reports whether the database is reachable.

**Connection troubleshooting**

- **`getaddrinfo ENOTFOUND db.<ref>.supabase.co`.** The direct-connection host is IPv6-only on newer projects. On networks without IPv6, use the **session pooler** string instead: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`. The user name includes the project ref.
- **`password authentication failed`.** Supabase's template shows `[YOUR-PASSWORD]`. Replace the whole thing, including the square brackets. Percent-encode special characters in the password, such as `@`, `#`, `/`, `?`, `%`, `[` and `]`.
- **`tenant/user postgres.<ref> not found`.** The pooler host is in the wrong region. Copy the exact host from the Connect dialog.

### Option B: local embedded database (no Supabase account)

```bash
cp Backend/.env.local.example Backend/.env.local
```

```bash
npm run db:local:setup
```

```bash
npm run dev:api:local
```

```bash
npm run dev:web
```

Data is stored in `Backend/.data/pglite` (git-ignored). To start over, delete that folder and run `db:local:setup` again. This mode is for development and testing only.

### Environment variables

| Where | Variable | Purpose |
| --- | --- | --- |
| Backend | `DATABASE_URL` | Supabase Postgres connection string. Required when `DB_DRIVER=postgres`; startup fails without it. **Secret: backend only.** |
| Backend | `DATABASE_SSL` | `true` (default) for Supabase. |
| Backend | `DB_DRIVER` | `postgres` (default) or `pglite` (local only). |
| Backend | `PGLITE_DATA_DIR` | Folder for the local PGlite database. |
| Backend | `PORT` | API port (default 4000). |
| Backend | `CORS_ORIGIN` | Allowed browser origin(s), comma-separated (default `http://localhost:5173`). |
| Backend | `SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`). Used to verify access tokens against the project's public signing keys. Required. |
| Frontend | `VITE_SUPABASE_URL` | Same project URL, for sign-in. |
| Frontend | `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) or legacy anon key (`VITE_SUPABASE_ANON_KEY`). Bundled into the browser by design. **Never** put the secret/service-role key here; the app refuses to start sign-in if it detects one. |
| Frontend | `VITE_API_URL` | API base URL for a separately hosted API. Leave unset in development. |
| Frontend | `API_PROXY_TARGET` | Dev-proxy target (default `http://localhost:4000`). Not exposed to the browser. |

### Regenerating the seed

`Backend/scripts/seed-data.js` holds the demo catalog. After editing it, run `npm --prefix Backend run seed:generate` to rewrite `supabase/seed.sql`. The generator adds an "Opening" movement per item so that stock matches the ledger.

## REST API

Successful responses are `{ "data": …, "meta"?: … }`. Errors are `{ "error": { "code", "message", "details"? } }`, where `details` maps field names to messages.

Every route except `/api/health` requires `Authorization: Bearer <Supabase access token>`. The permission each route needs is listed below and defined in `shared/permissions.js`.

Status codes:

- `400` malformed JSON
- `401` missing, invalid or expired session
- `403` no role, account disabled, or the role lacks the permission
- `404` unknown record or route
- `409` conflict (duplicate name, insufficient stock, plan already received)
- `422` validation failure
- `503` database unreachable

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | API and database status. Public. |
| GET | `/api/me` | The signed-in user: id, email, name, role, permissions. |
| GET | `/api/catalog/categories` | Categories with their spec field definitions. Permission: `catalog:view`. |
| GET | `/api/inventory` | Active items. Query: `q`, `category`, `status` (`in`/`low`/`out`), `demand` (`high`/`low`), `sort` (`name`, `category`, `price`, `stock`, `minStock`, `dailySales`, `status`), `dir`, `page`, `pageSize` (≤100; omit for all). `meta` holds totals, pages and status counts. Permission: `inventory:view`. |
| POST | `/api/inventory` | Create an item (with optional opening stock and specs). Permission: `inventory:manage`. |
| GET | `/api/inventory/movements` | Movement history. Query: `itemId`, `limit` (≤200). Permission: `movements:view`. |
| GET | `/api/inventory/:id` | One item. Permission: `inventory:view`. |
| PATCH | `/api/inventory/:id` | Update details or specs. Stock and category are rejected. Permission: `inventory:manage`. |
| DELETE | `/api/inventory/:id` | Archive an item; its history is kept. Permission: `inventory:manage`. |
| GET | `/api/inventory/:id/movements` | Movements for one item. Permission: `movements:view`. |
| POST | `/api/inventory/:id/adjustments` | `{ mode: receive\|remove\|set, quantity, reason }`. Returns the movement and the updated item. Permission: `inventory:adjust`. |
| GET | `/api/components` | Component catalog with spec summaries. Query: `category`. Includes the integrated-graphics option. Permission: `catalog:view`. |
| GET | `/api/components/:id` | Component detail with labelled spec rows. Permission: `catalog:view`. |
| POST | `/api/builds/validate` | `{ selection: { category: id } }` → all 11 rule results. Permission: `builds:run`. |
| POST | `/api/builds/search` | Backtracking search. `{ locked, budget?, inStockOnly?, maxSolutions?, traceLimit? }`. Permission: `builds:run`. |
| GET | `/api/builds` | Saved builds (newest first). Permission: `builds:view`. |
| POST | `/api/builds` | Save a build. The server recalculates compatibility and the total. Permission: `builds:save`. |
| GET | `/api/builds/:id` | One saved build. Permission: `builds:view`. |
| DELETE | `/api/builds/:id` | Delete a saved build. Permission: `builds:save`. |
| POST | `/api/optimizer/recommendations` | Run the DP optimizer. `{ budget, useCase, pri, cpuBrand, gpuBrand, minRam, excludeOOS, lean }`. Returns the recommendation, alternatives, compatibility and server time. Permission: `optimizer:run`. |
| POST | `/api/optimizer/runs` | Same input; runs and saves the result and its build. Permission: `optimizer:save`. |
| GET | `/api/optimizer/runs` | Saved runs. Permission: `optimizer:view`. |
| POST | `/api/restock/recommendations` | Greedy plan. `{ budget, coverDays: 7\|14\|30 }`. Permission: `restock:view`. |
| POST | `/api/restock/plans` | Compute and save a plan as a draft. Permission: `restock:save`. |
| GET | `/api/restock/plans` | Saved plans. Permission: `restock:view`. |
| GET | `/api/restock/plans/:id` | Plan with its line items. Permission: `restock:view`. |
| POST | `/api/restock/plans/:id/receive` | Receive every funded line atomically. Only once per plan. Permission: `restock:receive`. |
| GET | `/api/dashboard` | Dashboard statistics from database records. Permission: `dashboard:view`. `recentMovements` is `null` without `movements:view`. |

## Testing

Phase 2 database inspection, recovery evidence, proposed SQL and the production
approval checkpoint are documented in [docs/phase2/REPORT.md](docs/phase2/REPORT.md).
The audit and application-data snapshot commands only read the live database;
snapshot restore verification always uses a fresh in-memory database.

```bash
npm test
```

This runs 127 backend tests and 10 frontend rendering/integration tests (137 total). Backend tests use `node:test` against a fresh in-memory Postgres (PGlite) loaded with the real migrations and seed, plus a minimal stand-in for Supabase's `auth.users`. Tokens are signed with a locally generated ES256 key and checked by the same verifier code used in production. No credentials are needed.

- **API (29 tests).** Every endpoint, plus:
  - invalid bodies and filters, missing records, malformed JSON, and the startup config requirement;
  - duplicate names, stock adjustments and their ledger records, and insufficient stock leaving nothing changed;
  - archiving, saving and receiving plans (exactly once), and the dashboard totals.
- **Auth and permissions (22 tests).**
  - Every protected route returns 401 without a token; malformed, expired, forged, wrong-issuer, wrong-audience and tampered tokens are rejected.
  - Role claims inside a valid token are ignored. Users with no role, unknown users and disabled accounts get 403, and disabling takes effect immediately.
  - Staff can read and run algorithms but get 403 on every write, stock adjustment, movement view, save and receive, and nothing changes.
  - The dashboard hides movements from staff, and `/me` is correct.
  - Writes are attributed to the right user (movements, archive, builds, runs, plans created/received), and the actor setting doesn't leak.
  - Request bodies can't set roles or attribution, and errors don't leak internals.
  - Profiles are auto-created with no role, and the `users` script works.
- **Database (13 tests).**
  - Stock can only change through the functions, and the ledger is append-only.
  - Check, foreign-key and spec-validation constraints hold.
  - Multi-line receipts and plan receipts roll back fully on failure.
  - RLS is enabled on every table, the expected indexes exist, and archived names can be reused.
- **Algorithms (27 tests).**
  - Compatibility: matching builds, mismatches, integrated graphics, unknown specs, PSU wattage and connectors.
  - Backtracking: the solution set equals brute force; locks, in-stock-only and empty inventory are honoured.
  - DP: equals brute force on ₱100-multiple prices and is bounded by brute force on real prices. Also covers brand and memory constraints, insufficient budget, empty inventory and the state-count bound.
  - Greedy: ranking, budget, decision rules, the quantity formula, zero budget, empty inventory, and a case where greedy is suboptimal.
- **Phase 2 audit and recovery (6 tests).** Read-only audit classification, exact application-data restore and tamper detection, migration/seed repeatability, hardening checks, restoring older snapshots after newer migrations are added, and atomic refusal of inconsistent historical data.
- **Phase 3 follow-up (8 additional backend tests).** Exact decimal-demand ceilings (including 495 integer-reference cases), cent-valued DP balances/currency, reproducible alternative-save inputs, and minimum-budget alternatives.
- **Phase 3 independent verification (22 tests).** Separate compatibility, exhaustive DP and greedy references; fixed and varied fixtures; decimal/unknown/invalid inputs; ties, caps, large choice reconstruction, and HTTP integration. See [Phase 3 specifications and evidence](docs/PHASE3_ALGORITHM_CORRECTNESS.md). Reproduce illustrative operation counts and local timings with `npm --prefix Backend run bench:algorithms`.

**Frontend:** `npm --prefix Frontend test` renders the actual algorithm result components using Vite SSR and checks real API responses against a fresh in-memory database, with env-file loading disabled. Its 11 tests cover capped/exhaustive searches, cent-valued output, stale-catalog snapshots, alternative-save inputs, staff denial, and all Analysis views. These are rendering/integration tests, not browser interaction tests. [Current demo/defense checklist](docs/PHASE3_DEMO_READINESS.md). For a loopback-only, disposable demonstration with no production credentials, use the [defense runbook](docs/PHASE3_DEFENSE_RUNBOOK.md) (`npm --prefix Frontend run demo:isolated`). Historical browser verification: The six pages were checked manually in a browser against the local database at desktop, tablet (768 px) and phone (375 px) widths, covering console errors, loading, empty and error states, mutations persisting across reloads, dialogs, and the navigation drawer.

## Known limitations

- **Express is the authorization layer.** The backend connects with a privileged database role that bypasses RLS (see Trust boundaries). There is no per-user RLS.
- **No account self-service.** There is no password reset, sign-up or email verification UI, by design for now. Administrators manage accounts in Supabase and roles with `npm run users`.
- **Local PGlite mode still needs Supabase for sign-in.** It has no `auth.users`, so create the profile with `npm run users:local -- grant --id <auth user uuid> --email … --role admin`.
- **Live Supabase verification (Oct 25, 2026, PostgreSQL 17 via the session pooler).** Migrations and seed were applied, and these were checked on the live database:
  - row counts and the stock ledger audit;
  - RLS on all 10 tables with zero policies, and no table or function grants for `anon` or `authenticated` (the anon role is denied on reads and on `adjust_stock()`);
  - the stock guard, the append-only ledger, the oversell rejection, spec validation, and an atomic adjustment (inside a rolled-back transaction);
  - a 16-step API flow: create, adjust, persist, duplicate rejection, save/delete build, and all three algorithms.

  That flow left one archived test product, "LIVE VERIFICATION Test Kit 16GB", and its stock movements in the database. Movements are append-only by design.
- **Demand is a stored number.** `daily_sales` is a per-product average. There is no sales-records table, so it is not computed from history.
- **The spec catalog lives in two places.** It is defined in `shared/uw-core.js` (used by forms and rules) and in the `spec_definitions` table (used by database validation). Change both together.
- **Search caps.** Backtracking stops at 12 solutions or 40,000 nodes. The PC Builder's per-part hints are computed in the browser from the loaded inventory; saving re-validates on the server.
- **DP approximations.** Optimality depends on ₱100 rounding (see above), and scores are additive.
- **Plans saved from the restock page are recomputed on the server** from current stock at save time. If inventory changed in between, the saved plan can differ from what was on screen.
