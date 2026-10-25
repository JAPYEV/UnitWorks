# Phase 2 operational verification — October 26, 2026

Status: **Native database recovery verified; production migration 006 not yet
applied. A Supabase-hosted restore/cutover has not been rehearsed.**

The user regained access to the existing UnitWorks project and requested Phase 2
completion before Phase 4. Only the existing project is available; restoring
over it would risk the original records and is not part of this procedure.
Source branch: `codex/phase-2-signoff`, based on remote main `ba440a9` (Phase 3
PR #2 merged). Current isolated baseline: **119/119 tests passed**.

## Verified backup artifact

Official EDB PostgreSQL 17.11 portable tools were downloaded from the vendor
linked by postgresql.org. No system service or global installation was created.
The vendor archive SHA-256 is
`4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf`.

A fresh custom-format `pg_dump` archive was made from a single exported
repeatable-read, read-only snapshot. Original schema/data/ACL/default-privilege
entries are retained. A separate role export intentionally excludes passwords.

Local, gitignored backup folder:
`Backend/.data/backups/phase2-final-before-006/`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| database.dump | 442223 | d083ea5f5937652b2ed5921a57de5f8280b0c831b7b4ef741ae16d793984aa83 |
| roles-no-passwords.sql | 5900 | 470cb3d9053829b54def702893abe35ce8da93bb24757dc7c3f7b42521d718e8 |

`manifest.json`, `database.toc.txt`, `audit-at-backup.json` and
`local-rehearsal.json` hold the private inspection/recovery evidence. None are
committed. They contain private business/Auth information or metadata and must
not be uploaded to the PR. Keep the backup encrypted and access-controlled;
off-device backup storage remains an operator action.

The live source still has five migrations, 46 inventory products, 201
specifications, 59 stock movements and two profiles/Auth users. Inventory and
running movement balances reconcile. The two archived verification products
remain intact. No live business rows have been modified by this verification.
There are no Storage buckets/objects or Vault secrets in the captured source.
Realtime and Storage do contain platform migration-history rows; those managed
schemas remain in the full archive but were not replayed in this local test.

## Actual recovery rehearsal

A fresh PostgreSQL 17.11 cluster was initialized under gitignored
`Backend/.data/recovery/`, with a random disposable password, SCRAM host
authentication and a listener restricted to `127.0.0.1:55439`. It was stopped
after testing. The rehearsal did not use the production connection or overwrite
an existing database.

The archive was read back, its checksum verified, and the application, Auth and
`unitworks_meta` schemas restored. All **11 application tables and all 27 Auth
tables matched the source snapshot's row counts and content hashes**. This
includes user/identity/session data without printing any row contents.

Important recovery details found and verified:

- Plain PostgreSQL lacks Supabase's internal role-grant bootstrap. For the local
  rehearsal only, exported memberships/options were replayed by the disposable
  restore administrator, while exported role flags were preserved. The original
  role file and its grantor provenance remain unchanged in the backup. This
  verifies effective membership behavior, not a byte-identical managed grant graph.
- Schema-filtered `pg_restore` omits the namespace-level ACL entries because
  those entries have no namespace tag. The exact saved Auth/public schema ACLs
  were restored separately from the archive's table of contents. This is required
  for the Auth provisioning trigger and profile foreign key to work correctly.
- Standard pgcrypto/uuid-ossp extensions were bootstrapped locally. Supabase Vault,
  Storage and Realtime service/extension bootstrap were not emulated or claimed.

Migration 006 was applied **only in the recovered clone**, as `postgres`, with
its normal transaction/history entry. All original application row hashes
remained identical. Both browser roles still lacked application-table/function
access. New table/function/identity-sequence probes also confirmed that the
narrowed future-object defaults deny browser access.

Fifteen HTTP checks ran against the real Express API and native PostgreSQL clone,
using locally signed test tokens and disposable Auth/profile fixtures:

- Missing-token inventory read: 401; Staff dashboard: 200; Staff write: 403.
- Admin creates an inventory fixture, receives stock (201), reloads and confirms
  the persisted count, saves/loads/deletes a build, and runs optimizer features.
- A restock plan saves/receives successfully; repeat receipt returns 409.
- Archiving the fixture succeeds, active lookup returns 404, and every remaining
  inventory balance still reconciles with its append-only ledger.

Successful rehearsal evidence timestamp: **October 26, 2026, 02:03:09 Manila**.
No production Auth login or Supabase service cutover is implied by these tests.

## Production decision still required

The earlier RECOVERY.md gate asked for a full Supabase recovery rehearsal before
production changes. Current evidence is stronger than the original PGlite JSON
snapshot: it verifies a real native restore of all application and Auth data,
schema changes, privileges and API workflows. It is still **not** a hosted
Supabase/Vault/Storage/Realtime recovery or an Auth HTTP sign-in rehearsal.

Before running migration 006, the operator must either explicitly accept this
documented database-scoped recovery evidence for the reviewed non-data-changing
migration, or supply a separate Supabase recovery project and complete the
broader platform rehearsal first. Do not silently mark that scope decision made.

The prepared deployment verifies the archive checksum, successful rehearsal,
expected five live migration names, `postgres` execution role, unchanged
application fingerprints since backup and zero integrity findings before it
calls the existing migration runner. Afterward it will verify migration history,
four enabled total guards, browser grants and unchanged business-row hashes.
No archived products or historical ledger rows are to be deleted or zeroed.

After any approved deployment, re-run integrity/security tests, capture the actual
production result and update REPORT.md/RECOVERY.md. Until then Phase 2 remains
pending production approval/deployment and final verification. Phase 4 is paused.
