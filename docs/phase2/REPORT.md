# Phase 2: database and data cleanup review

Audit date: October 25, 2026 (Asia/Manila). Branch: `codex/phase-2-data-audit`,
created from freshly fetched `origin/main` (`4208e7c`).

Status: **Hardening implementation ready for draft review; production approval
and full Supabase recovery verification are still pending. Phase 2 is not yet complete.**
No production DDL, data cleanup, role changes, or application mutations were run.
Do not apply the proposed SQL until the review and backup prerequisites below
have been satisfied. Existing migration files and Phase 1 authorization are unchanged.

## Inspection and evidence

### Resumed Phase 2 implementation

The follow-up branch `codex/phase-2-hardening` starts directly at `origin/main`
commit `cab4a08`. The user requested resuming Phase 2 and preparing a draft PR.
This authorizes preparing the fixes; it does not establish a verified full
platform backup or approve production SQL. No live migration has been run.

New migration `20261025000600_data_integrity_hardening.sql` implements F1/F2:

- Future-object grants are narrowed for the actual migration execution role
  (`postgres` on the audited live database); nonexistent browser roles are
  skipped in local Postgres. Platform-managed owners remain unchanged.
- Four deferred constraint triggers validate build/restock line sums. Parent
  locks serialize validation and affected parent IDs are processed in stable
  order. Valid save/delete/receive workflows continue to pass.
- A bounded-lock preflight rejects historical mismatches rather than changing
  rows. The migration takes write-conflicting locks on the four snapshot tables
  before checking existing totals. The migration runner records it only if the
  transaction commits. Existing five migrations have not been edited.

Two recovery defects were also corrected: snapshot capture now records only
the database's **applied** migration prefix, and restoration replays that exact
prefix even when newer migrations exist in the checkout. It still rejects
unknown/gapped histories and changed migration hashes. Restore verification
forces deferred constraints before declaring success. Database `exec()` now
rolls back a failed multi-statement transaction on the same connection before
returning it to the pool, preventing an aborted migration from poisoning a
later request. An isolated regression verifies rollback and continued use.

The resumed read-only audit again reconciled all 46 products and 59 movements;
all original per-table fingerprints remain identical. A fresh application-data
snapshot, `Backend/.data/backups/phase2-resumed-predeployment.json`, was read back
and restored successfully across all 11 tables with zero ledger discrepancies.
Its SHA-256 is `dc2bd4ea96c740096073fcd3b3b61caf2b31d7ca749c922875b61f88f924a050`;
verification completed October 25, 2026, 16:08:17 Manila. This remains an
application-data rehearsal, not a full Supabase/Auth/platform recovery.

The complete backend suite now passes **97/97 tests**, including every original
authorization test and all normal API workflows with migration 006 active in
the isolated databases. The existing failed-plan receipt fixture had an
incorrect header total (20,000 versus its 19,770 line sum); its header and
remaining amount were corrected without changing the rollback scenario.
The production frontend build also passed; Vite emitted its chunk-size warning
for the existing bundle over 500 kB. Read-only before/after audits confirm identical
application row fingerprints and exactly five live applied migrations.

The draft is not a deployment approval. Outstanding review decisions remain
F1/F2 scope approval, explicit acceptance of retained archives/unknown specs and
operational/indexing deferrals, plus full recovery evidence. Phase 3's prerequisite
is not satisfied merely by merging this draft.

The following sections preserve the initial production audit and its evidence;
they describe the five-migration live database, not the hardened test database.

Repository review covered all five migrations, generated seed and generator,
migration/seed runners, database adapter, inventory and plan repositories,
inventory and algorithm services, authentication middleware and database/API/auth
tests. Live inspection used one dedicated connection per run with
`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, statement/lock timeouts, and
unconditional rollback. Application write functions were never invoked live.

The final audit completed 37 checks. Supabase's separate migration-history table
was absent (`42P01`); this database uses the repository's
`unitworks_meta.applied_migrations`, containing exactly the five expected files.
The history records filenames, not original content hashes, so it alone cannot
prove old source files were never edited. Current migration hashes are included
in the local artifacts, normalized to LF for cross-platform recovery.

| Table | Live rows |
| --- | ---: |
| component_categories | 8 |
| spec_definitions | 36 |
| inventory_items | 46 (44 active, 2 archived) |
| component_specs | 201 |
| inventory_movements | 59 |
| user_profiles | 2 (one active admin, one active staff) |
| pc_builds / pc_build_components | 0 / 0 |
| optimization_runs | 0 |
| restock_plans / restock_plan_items | 0 / 0 |

Evidence files are intentionally local and gitignored; they include private
business records and must not be attached to a public PR:

- `Backend/.data/audits/phase2-final.json`: catalogs, integrity checks, migration hashes and row fingerprints.
- `Backend/.data/audits/schema-comparison-final.json`: comparison against a fresh database using current migrations.
- `Backend/.data/backups/phase2-app-data-v2.json`: application-data snapshot.
- `Backend/.data/backups/phase2-app-data-v2.json.verification.json`: actual artifact checksum and restore verification.

The live database has 94 constraints, all validated, and 27 indexes. Their
definitions match a fresh migration replay. All 18 application function bodies
(after normalizing CRLF/LF), signatures, security-definer flags and search paths
match the replay. Seven application triggers, including both Auth provisioning
triggers, are enabled. All 11 application tables have RLS enabled, zero policies;
both read views use `security_invoker=true`. Catalog checks show no effective
table SELECT/INSERT/UPDATE/DELETE/TRUNCATE, sequence USAGE/UPDATE, or function
EXECUTE access for `anon` or `authenticated`.

All 46 inventory quantities equal the sum of their ledger movements, and every
movement's `stock_after` equals its running balance by identity order. No negative
balances, bad movement signs, invalid inventory/spec values, normalized duplicate
active names/SKUs, or checked orphan references were found. Profile/Auth links
and emails agree. Snapshot totals and receipt checks return no discrepancies,
but the corresponding live tables are empty, so these workflows were exercised
in isolated tests rather than inferred from production history.

Fingerprints for all 11 application tables were identical across the initial and
final live audit snapshots. This is evidence of no observed row changes during
the audit interval; the read-only transactions independently prohibit this
tooling from writing. This does not measure external systems or all platform tables.

## Findings and decisions proposed for approval

| ID | Classification / severity | Evidence and affected scope | Impact and proposed response |
| --- | --- | --- | --- |
| F1 | Confirmed configuration gap / medium | `pg_default_acl` grants future postgres-owned public tables, sequences and functions to `anon` and `authenticated`; built-in PUBLIC function EXECUTE also applies. Existing objects have been correctly revoked. Managed `supabase_admin` has separate permissive defaults. | A later migration could accidentally expose a new object. Proposed SQL section A narrows defaults for the actual application migration owner, `postgres`. It does not edit managed-role defaults. Review the global future-function scope and retain explicit revokes/RLS in every new migration. No present browser access was found. |
| F2 | Confirmed integrity enforcement gap / medium | `pc_builds.total_price` and `restock_plans.total_cost` are not constrained against their child-line sums. Isolated calls can save inconsistent totals; no affected live rows exist. | Application code computes these sums today. Section B adds deferred constraint triggers for both parents and children, preserving atomic saves and cascading build deletion. Local tests reject inconsistent saves/line updates and accept valid build saves, plan receipt and deletion. |
| C1 | Business decision / low | The two archived verification products retain 3 and 5 units and immutable history; see details below. Archive function intentionally changes only archive metadata. | Retain both products and all ledger rows. Do not infer zero physical stock from a test-like name. If physical stock is disputed, obtain a real count and separately approve a correction that accounts for the archived-state restriction. |
| C2 | Expected unknowns / informational | Seven missing specification rows: four air-cooler radiator sizes, the Wraith radiator size, one AIO height, and RTX 3050 length. The numeric values that do exist are valid; shared form definitions match the database catalog. | Six cooler omissions correspond to the alternate cooling mode. GPU length is unknown in the seed and prevents fully verifying clearance. Keep unknown values absent; obtain a verified specification before filling any value. |
| C3 | Recovery prerequisite / medium | Application snapshot restored and matched, but no verified full Supabase backup/restore, plan entitlement or platform backup download was available through current tools. Neither PostgreSQL client binaries nor Supabase CLI/Docker were found on PATH. | Complete the platform recovery steps in RECOVERY.md before production changes. The application snapshot excludes Auth credentials, Storage objects, roles and platform settings. |
| C4 | Migration/seed operational concern / low | Migration runner uses filename-only history and no concurrent-run lock; seed runner checks inventory only before executing a transactional seed. Seed output regenerates with no git diff, migration rerun is a no-op and reseeding existing inventory skips. | Use one migration mechanism and one operator; never seed production or run concurrent setup jobs. Do not rewrite applied migrations. Wider seed guards/checksummed histories can be a later reviewed change; no data inconsistency was observed here. |
| C5 | Future indexing concern / low | Several nullable creator/profile references and `optimization_runs.build_id` lack dedicated FK indexes. Existing 27 index definitions match migrations. | No workload/performance defect established at current size. Add indexes only after observing query plans/workload; do not invent a cleanup need. |

The retained user ID on a movement has deliberately no profile FK: deleted users
must not force rewriting immutable history. Nullable creator/archive fields on
older records are likewise not sufficient evidence of corruption. Active-only
name uniqueness intentionally allows archived names to repeat.

## Archived verification records

| Product ID suffix (common prefix `ram-live-verification-test-kit-16gb-`) | Archived at (Manila) | Ledger evidence | Stock | Other references |
| --- | --- | --- | ---: | --- |
| `wgz` | Oct 25, 11:46:51 | Movement 58: Received +3, stock_after 3 | 3 | No saved-build or plan references |
| `qep` | Oct 25, 11:46:57 | Movement 59: Received +3, stock_after 3; movement 60: Received +2, stock_after 5 | 5 | No saved-build or plan references |

Both have the name `LIVE VERIFICATION Test Kit 16GB`, notes on their movements,
and no movement after archiving. Archive/user attribution is null; both predate
the recorded Auth migration (12:40:27 Manila). This is consistent with legacy
verification history and does not justify fabricating attribution. There are
identity gaps in the ledger, which are normal for rolled-back identity allocation;
IDs need not be consecutive. Deleting or resetting either product would discard
valid historical evidence without solving a confirmed discrepancy.

## Stock and snapshot business rules

- Demo seed inserts its opening balances and matching history together. All 44 seeded products reconcile.
- New products start at zero; nonzero opening stock is recorded as `Received` by `create_inventory_item`, not necessarily the `Opening` enum. Both count in the ledger.
- Receipts and returns add stock; sales reduce it; transfer, damage and count corrections use signed `Adjustment` entries. A matching physical count records no movement.
- Stock operations lock active inventory rows and update stock and ledger in one transaction. Archived products cannot receive adjustments. Archiving does not dispose of stock or remove specifications/history.
- Saving builds/optimizer results does not reserve or sell stock. Their unit prices are historical snapshots and must not be compared with current catalog prices as a corruption test.
- Receiving a restock plan locks it, appends funded lines and marks it received once, atomically. Drafts containing subsequently archived funded products are blocked. None were found live.
- Receipt references currently use only eight UUID characters. No collisions exist in current data (no saved plans). Treat a future ambiguous receipt match as an investigation, not automatic cleanup.

The privileged backend connection remains a trust boundary: database owners can
override application conventions. This audit does not claim the stock guards
can defend against arbitrary owner SQL. Express authorization is unchanged.

## Proposed application, rollback and verification

`proposed-hardening.sql` preserves the original review proposal. The executable
follow-up is now the new migration
`supabase/migrations/20261025000600_data_integrity_hardening.sql`, tested only
in isolated databases. It contains no row cleanup. Deploy it only after
approval and full recovery verification. Do not modify the five already-applied files.

1. Retain the two archived products, eight combined units and three movements.
2. Confirm backup evidence and actual migration owner (`postgres` in the audit).
3. Re-run read-only integrity checks; reconcile or investigate any new findings
   before applying aggregate constraints. Acquire a maintenance window if needed.
4. Apply only approved hardening sections in one transaction with bounded lock
   timeouts using the existing migration mechanism. Table locks may briefly block
   writers. Deferred triggers check new/changed transactions; they do not repair
   preexisting inconsistent rows. Deadlocks/concurrent write failures require a
   retry, not disabling guards.
5. Re-run audit, compare expected catalog differences and row fingerprints, run
   backend/authorization tests and role permission checks, and verify normal
   create/adjust/archive/build/save/receive flows in staging. Do not run destructive
   verification transactions against production.

Before commit, transaction rollback removes proposed DDL. After commit, use a
forward rollback migration to drop the four new constraint triggers and
`check_saved_snapshot_total()` if necessary. Default privilege rollback must
restore the **captured ACLs**, scoped to each owner/schema/object type; do not
blindly grant privileges from an example. Default changes do not retroactively
change any objects created in the interval. Removing guards cannot recover bad
writes; database restore has its own cutover and data-loss limits.

## Verification and changed files

For the resumed implementation, changed files are the new migration,
`Backend/scripts/migrate.js`, `Backend/scripts/data-snapshot.js`,
`Backend/src/lib/db.js`, `Backend/test/helpers.js`,
`Backend/test/data-audit.test.js`, `Backend/test/db.test.js`, `README.md`,
this report and `RECOVERY.md`. Baseline: 95 passing tests; final: 97 passing
tests. No frontend runtime or algorithm code changed. No production SQL was
applied. The evidence below describes the earlier audit-tooling commit.

The full `npm test` run passed **95/95 tests**, including the existing 91 backend,
database, algorithm and authorization tests.
Four new tests cover read-only refusal and audit classification, snapshot
restore/tamper detection, migration/seed repeatability, and isolated execution
of the proposed SQL with valid and invalid saves/receipt behavior. Regenerating
the seed produced no source diff. No frontend runtime code was changed.

Files added/changed:

- `Backend/scripts/data-audit.js`: repeatable read-only catalog and integrity audit, isolated connection, safe error codes, local evidence.
- `Backend/scripts/data-snapshot.js`: consistent application-row export, checksums, migration manifest, isolated restore verification; no configurable restore target.
- `Backend/test/data-audit.test.js`: meaningful database/audit/recovery/hardening regressions.
- `Backend/package.json`: `db:audit` and `db:snapshot` commands.
- `README.md`: entry point for Phase 2 operations.
- `docs/phase2/REPORT.md`, `RECOVERY.md`, `proposed-hardening.sql`: findings, recovery procedure and exact unexecuted changes.

Production SQL operations: catalog/data SELECTs, read-only transaction/session
settings, savepoints and rollback only. Applied production migrations: **none**.
Live data changes: **none**. No findings have been silently treated as accepted;
review F1/F2, retention of C1/C2 and deferral reasons for C3–C5 explicitly.

Approval requested: accept retention of both archived records and the documented
unknowns; review sections A/B and their scope. Production application remains
pending explicit approval **and** full recovery verification. Phase 2 can only be
closed after approved fixes are applied/verified or findings are explicitly
accepted with reasons, and the full backup/recovery prerequisite is fulfilled.
