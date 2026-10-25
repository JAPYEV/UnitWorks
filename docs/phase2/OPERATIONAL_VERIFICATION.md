# Phase 2 operational verification — October 26, 2026

Status: **Phase 2 completed for the operator-approved database recovery scope.
Migration 006 is applied and verified. A Supabase-hosted restore/cutover remains
untested and was explicitly accepted as a recovery limitation.**

The operator approved: “Approve migration 006 with this recovery limitation.”
This acceptance concerns the native database/Auth recovery evidence described
below; it does not claim a full hosted Supabase disaster recovery rehearsal.
Migration completed October 26, 2026, **02:10:52 Manila**.

## Final production result

- Exactly migration `20261025000600_data_integrity_hardening.sql` was applied,
  transactionally through the existing runner as `postgres`.
- History now contains six migrations. Constraints increased from 94 to 98;
  indexes remain 27. All four deferred total-check triggers are enabled.
- All 11 application-table row fingerprints are unchanged, including inventory,
  specifications, profiles, archived products and all 59 immutable movements.
  Stock totals/running balances and profile/Auth consistency have zero findings.
- RLS remains enabled on all 11 tables. `anon` and `authenticated` still have
  no application-table/function access. Existing 18 function definitions and
  ACLs are unchanged; only the new total-check function was added.
- The migration owner's future public table/sequence/function grants no longer
  include browser roles. The owner's global PUBLIC function-execute default is
  revoked. Supabase-managed owners' defaults were intentionally not changed.
- The complete post-deployment isolated regression suite passed **119/119**,
  including authorization, Phase 2 recovery and Phase 3 correctness tests.

Private production evidence:
`Backend/.data/audits/phase2-production-006.json`. It contains before/after
catalogs, row fingerprints, backup binding and the applied result. Backup and
rehearsal files remain gitignored. Disposable local clusters were stopped and
removed after verification; the original archives and evidence were retained.

Finding disposition: F1/F2 are fixed. C1's archived verification products are
retained because their balances/history are consistent; C2's unknown/inapplicable
specifications remain absent rather than fabricated. C3's narrower recovery
scope was explicitly approved. C4/C5 are documented operational/performance
concerns without observed data defects: retain a single migration operator,
never seed existing production inventory, and add FK indexes only when workload
evidence justifies them. No data cleanup or historical rewrite was justified.

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

A post-migration native archive was also created and inspected at
`Backend/.data/backups/phase2-final-after-006/database.dump` (445850 bytes,
SHA-256 `3681b2606edb3443a96b1a1daecd7bd525e52f9f603f8f9a698fc9d147633931`).
It includes the six-migration schema and final defaults. Direct restore of that
second archive was not separately rehearsed; the verified recovery path is the
pre-migration archive followed by the tested 006 migration.

`manifest.json`, `database.toc.txt`, `audit-at-backup.json` and
`local-rehearsal.json` hold the private inspection/recovery evidence. None are
committed. They contain private business/Auth information or metadata and must
not be uploaded to the PR. Keep the backup encrypted and access-controlled;
off-device backup storage remains an operator action.

At the pre-deployment backup point the source had five migrations, 46 inventory products, 201
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

## Approved production decision and recovery limitations

The earlier RECOVERY.md gate asked for a full Supabase recovery rehearsal before
production changes. Current evidence is stronger than the original PGlite JSON
snapshot: it verifies a real native restore of all application and Auth data,
schema changes, privileges and API workflows. It is still **not** a hosted
Supabase/Vault/Storage/Realtime recovery or an Auth HTTP sign-in rehearsal.

The operator explicitly accepted this database-scoped recovery evidence for the
reviewed non-data-changing migration. That decision was received before running
the live migration. Full hosted recovery, managed-service bootstrap, actual Auth
HTTP sign-in, off-device encrypted backup retention and a disaster cutover remain
future operational work, not claims of completed tests.

The completed deployment verified the archive checksum, successful rehearsal,
expected five live migration names, `postgres` execution role, unchanged
application fingerprints since backup and zero integrity findings before it
called the existing migration runner. Afterward it verified migration history,
four enabled total guards, browser grants and unchanged business-row hashes.
No archived products or historical ledger rows are to be deleted or zeroed.

Integrity/security tests, production result capture and report updates are
complete for this approved scope. Phase 4 may now begin against controlled
fixtures; production deployment/testing of unrelated application changes remains
outside that testing task.
