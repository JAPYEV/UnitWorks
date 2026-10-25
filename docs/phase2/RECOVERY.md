# Phase 2 backup and recovery

## Verified local application snapshot

Run from the repository root; dependencies must already be installed:

```powershell
npm --prefix Backend run db:audit -- .data/audits/phase2-next.json
npm --prefix Backend run db:snapshot -- capture .data/backups/phase2-next.json
```

Paths are relative to Backend because npm runs that package's commands there.
Choose a new filename each run: exports and verification evidence refuse to
overwrite existing files. The live connection must use `DB_DRIVER=postgres` and
the existing server-only `.env` settings. Never paste secrets into the command
line, reports or PR. Do not run migrations/seed as part of backup preparation.

Capture reads all 11 application tables in a single read-only repeatable-read
transaction. The artifact retains exact database JSON numeric values rather
than converting bigint/numeric through JavaScript numbers. It stores row
SHA-256 checksums and LF-normalized migration file hashes. It excludes all Auth
credential/session tables and platform secrets. Profile email/name and business
rows are private: keep the artifact in gitignored `Backend/.data/`, restrict its
filesystem access, and move an encrypted copy to an approved off-device backup
location. Do not upload the artifact to the PR.

The capture command reads the written file back and restores its rows into a
fresh **in-memory** PGlite database. It checks all per-table content checksums and
stock reconciliation, then rolls back and closes the sandbox. It cannot accept
a live restore target. The sandbox uses current migrations, reference rows are
replaced only in that empty sandbox, and the ledger identity sequence is advanced.
No existing database is reset. To verify a copied artifact, use a new path with
no existing verification sidecar:

```powershell
npm --prefix Backend run db:snapshot -- verify .data/backups/copied-snapshot.json
```

Keep the matching repository revision with the backup. Capture now records only
the migration prefix actually applied to the source database. Newer migrations
may be present in the checkout: verification replays the snapshot's exact prefix
and does not prematurely upgrade it. Edited migration hashes, unknown filenames
or gaps still fail verification. Plan forward migration on a recovered database
separately after replaying its original schema and data.

The current checkout includes migration 006, pending production approval. It is
not part of the live predeployment snapshot, whose history still has five files.
New local test databases do apply 006. **Do not run `db:migrate` against the live
connection until the review and full recovery checklist below is complete.**

Resumed predeployment artifact:

- File: `Backend/.data/backups/phase2-resumed-predeployment.json`.
- SHA-256: `dc2bd4ea96c740096073fcd3b3b61caf2b31d7ca749c922875b61f88f924a050`.
- Verified: October 25, 2026, 16:08:17 Manila; all 11 application tables match,
  with zero ledger discrepancies. The original artifact below remains unchanged.

Verified artifact for this review:

- File: `Backend/.data/backups/phase2-app-data-v2.json`.
- SHA-256: `356d624a8aa9d45f9dbdda19d24bfdd229f0b194579d63b5ef212682adaa30ae`.
- Verification: Oct 25, 2026, 15:34:11 Manila (07:34:11 UTC).
- Result: all 11 tables match the captured rows, 46 products, 201 specifications,
  59 movements, 2 profiles and zero stock-ledger mismatches.

**This is an application-data recovery artifact, not a full Supabase disaster
recovery backup.** Its isolated rehearsal does not verify Auth-user restoration,
custom roles/grants, production schema replay, Supabase settings or Storage.
There is no supported live import command in this change. Importing an archived
snapshot into production would require a separately reviewed recovery procedure
that preserves user IDs, timestamps, ledger identities and constraints.

## Required full Supabase recovery preparation

Current Supabase guidance describes both [platform database backups](https://supabase.com/docs/guides/platform/backups)
and a [CLI logical backup and restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
Use the method available for the actual project/plan. Do not assume a scheduled
backup exists, can be downloaded, or covers every external asset.

Before production changes:

1. In the Supabase dashboard, inspect the project's available backup/PITR
   options, timestamp, retention and recovery target. Record evidence without
   credentials. Current tools did not verify the project's backup entitlement.
2. If using logical exports, provision the documented Supabase CLI and its
   required runtime/client prerequisites in an approved environment. Follow the
   official roles, schema and data export procedure using protected environment
   variables/credential files. Verify Auth data, application Auth triggers,
   `unitworks_meta` migration history and owner/default-privilege settings are
   actually included. Multiple exports must represent a consistent recovery
   point; freeze writes during the export or use a coordinated snapshot.
3. Store exports securely off-device with sizes, checksums, timestamps, database
   version, source identity, migration manifest and exact restore procedure.
   Database exports do not back up the actual Storage files; preserve those
   separately if used, along with required external configuration.
4. Restore to an isolated disposable Supabase project following the matching
   official procedure. Never point rehearsal commands at the production URL.
   Do not disable production RLS, triggers or constraints to make restore work.
5. Confirm Auth accounts and profile IDs/roles, application catalog definitions,
   RLS/grants, ledger row identities and balances, snapshot totals, migration
   history, next movement identity and normal application workflows. Re-run
   authorization checks, including staff write denial. Record results and the
   actual restored database target without secrets.
6. Only mark full recovery verified once artifacts and successful rehearsal
   evidence exist. Establish acceptable downtime/data-loss limits, cutover steps,
   and a plan to reconcile writes after the recovery point before approval to
   apply any production changes.

Full platform backup and recovery is **pending**, not claimed successful.
The verified local application snapshot can aid investigation/recovery, but does
not replace this prerequisite.
