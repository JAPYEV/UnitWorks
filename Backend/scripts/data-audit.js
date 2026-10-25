// Deliberately separate from the application's pool: every inspection uses one
// repeatable-read, READ ONLY transaction, and never calls application functions.
import pg from 'pg';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { MIGRATIONS_DIR } from './migrate.js';

export const TABLES = ['component_categories', 'spec_definitions', 'user_profiles', 'inventory_items',
  'component_specs', 'inventory_movements', 'pc_builds', 'pc_build_components',
  'optimization_runs', 'restock_plans', 'restock_plan_items'];
export const migrationManifest = () => readdirSync(MIGRATIONS_DIR).filter(n => n.endsWith('.sql')).sort()
  .map(name => ({ name, sha256: createHash('sha256').update(readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8').replaceAll('\r\n','\n')).digest('hex') }));

export const CHECKS = {
  tables: `select c.relname, c.relkind, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity, c.reloptions
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','v','p') order by c.relname`,
  columns: `select table_name, column_name, data_type, is_nullable, column_default, is_identity
    from information_schema.columns where table_schema='public' order by table_name, ordinal_position`,
  constraints: `select c.relname as table_name, k.conname, k.contype, k.convalidated, pg_get_constraintdef(k.oid) as definition
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' order by c.relname,k.conname`,
  indexes: `select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname`,
  triggers: `select n.nspname as schema_name,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and (n.nspname='public' or t.tgname like 'unitworks_%') order by n.nspname,c.relname,t.tgname`,
  functions: `select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef,p.proconfig,
    md5(replace(p.prosrc,chr(13),'')) as body_md5,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' order by p.proname,arguments`,
  policies: `select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public'`,
  grants: `select grantee,table_name,privilege_type from information_schema.table_privileges
    where table_schema='public' order by grantee,table_name,privilege_type`,
  effective_table_access: `select r.rolname,c.relname,
    has_table_privilege(r.oid,c.oid,'SELECT') as can_select,has_table_privilege(r.oid,c.oid,'INSERT') as can_insert,
    has_table_privilege(r.oid,c.oid,'UPDATE') as can_update,has_table_privilege(r.oid,c.oid,'DELETE') as can_delete,
    has_table_privilege(r.oid,c.oid,'TRUNCATE') as can_truncate
    from pg_roles r cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
    where r.rolname in ('anon','authenticated') and n.nspname='public' and c.relkind in ('r','v','p') order by r.rolname,c.relname`,
  effective_function_access: `select r.rolname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
    has_function_privilege(r.oid,p.oid,'EXECUTE') as can_execute from pg_roles r cross join pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where r.rolname in ('anon','authenticated') and n.nspname='public'
    order by r.rolname,p.proname,arguments`,
  sequences: `select c.relname,c.relacl::text,r.rolname,has_sequence_privilege(r.oid,c.oid,'USAGE') as can_use,
    has_sequence_privilege(r.oid,c.oid,'UPDATE') as can_update from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join pg_roles r where c.relkind='S' and n.nspname='public' and r.rolname in ('anon','authenticated')`,
  default_privileges: `select pg_get_userbyid(d.defaclrole) as owner,n.nspname,d.defaclobjtype,d.defaclacl::text
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace`,
  ledger_totals: `select i.id,i.stock,coalesce(sum(m.quantity::bigint),0)::text as ledger_total,
    (i.stock-coalesce(sum(m.quantity::bigint),0))::text as difference
    from inventory_items i left join inventory_movements m on m.item_id=i.id group by i.id,i.stock
    having i.stock<>coalesce(sum(m.quantity::bigint),0) order by i.id`,
  ledger_running_balances: `with running as (select id,item_id,quantity,stock_after,
    sum(quantity::bigint) over(partition by item_id order by id rows unbounded preceding) as expected
    from inventory_movements) select *,expected::text as expected_balance from running where stock_after<>expected or expected<0 order by id`,
  invalid_movements: `select id,item_id from inventory_movements where quantity=0 or stock_after<0
    or (movement_type='Sale' and quantity>=0) or (movement_type in ('Opening','Received','Return') and quantity<=0)`,
  invalid_specs: `select s.item_id,s.category_key,s.spec_key,s.value from component_specs s
    left join inventory_items i on i.id=s.item_id left join spec_definitions d on d.category_key=s.category_key and d.spec_key=s.spec_key
    where i.id is null or i.category_key<>s.category_key or d.spec_key is null or btrim(s.value)=''
    or (d.data_type='number' and s.value !~ '^[0-9]+([.][0-9]+)?$')
    or (d.data_type='select' and not(s.value=any(d.options))) order by s.item_id,s.spec_key`,
  missing_specs: `select i.id,d.spec_key from inventory_items i join spec_definitions d on d.category_key=i.category_key
    left join component_specs s on s.item_id=i.id and s.spec_key=d.spec_key
    where i.archived_at is null and s.item_id is null order by i.id,d.spec_key`,
  duplicate_names: `select lower(btrim(name)) as normalized_name,array_agg(id order by id) as ids
    from inventory_items where archived_at is null group by lower(btrim(name)) having count(*)>1`,
  duplicate_skus: `select lower(btrim(sku)) as normalized_sku,array_agg(id order by id) as ids
    from inventory_items group by lower(btrim(sku)) having count(*)>1`,
  invalid_inventory: `select id from inventory_items where stock<0 or min_stock<0 or price<=0 or unit_cost<=0
    or unit_cost>price or btrim(sku)='' or btrim(brand)='' or length(btrim(name))<4
    or daily_sales<0 or lead_time_days<1 or moq<1 or perf_gaming not between 0 and 100
    or perf_work not between 0 and 100 or perf_score not between 0 and 100`,
  archived_items: `select i.id,i.name,i.stock,i.archived_at,i.archived_by,
    (select count(*)::int from inventory_movements m where m.item_id=i.id) as movements,
    (select count(*)::int from pc_build_components b where b.item_id=i.id) as build_references,
    (select count(*)::int from restock_plan_items p where p.item_id=i.id) as plan_references
    from inventory_items i where archived_at is not null order by i.id`,
  archived_history: `select m.id,m.item_id,m.movement_type,m.quantity,m.stock_after,m.created_at,
    m.performed_by_user_id,(m.note<>'') as has_note,(m.reference is not null) as has_reference
    from inventory_movements m join inventory_items i on i.id=m.item_id where i.archived_at is not null order by m.item_id,m.id`,
  archive_state_concerns: `select id,stock,archived_at from inventory_items where (archived_at is null and archived_by is not null)
    or (archived_at is not null and stock>0)`,
  movements_after_archive: `select m.id,m.item_id,m.created_at,i.archived_at from inventory_movements m
    join inventory_items i on i.id=m.item_id where m.created_at>i.archived_at`,
  build_totals: `select b.id,b.total_price,coalesce(sum(c.unit_price),0) as component_total
    from pc_builds b left join pc_build_components c on c.build_id=b.id group by b.id,b.total_price
    having b.total_price<>coalesce(sum(c.unit_price),0)`,
  invalid_build_snapshots: `select id from pc_builds where jsonb_typeof(checks)<>'array'`,
  optimization_consistency: `select r.id,r.build_id from optimization_runs r left join pc_builds b on b.id=r.build_id
    where (r.build_id is not null and (b.id is null or r.total_price is distinct from b.total_price))
    or (r.feasible and (r.score is null or r.total_price is null)) or r.total_price>r.budget or jsonb_typeof(r.stats)<>'object'`,
  restock_totals: `select p.id,p.total_cost,coalesce(sum(i.order_cost),0) as line_total from restock_plans p
    left join restock_plan_items i on i.plan_id=p.id group by p.id,p.total_cost having p.total_cost<>coalesce(sum(i.order_cost),0)`,
  restock_lines: `select plan_id,item_id from restock_plan_items where order_cost<>order_qty*unit_cost
    or order_qty>recommended_qty or ((decision='skipped')<>(order_qty=0))
    or (decision='selected' and order_qty<>recommended_qty) or (decision='partial' and order_qty>=recommended_qty)`,
  archived_draft_lines: `select l.plan_id,l.item_id from restock_plan_items l join restock_plans p on p.id=l.plan_id
    join inventory_items i on i.id=l.item_id where p.status='draft' and l.order_qty>0 and i.archived_at is not null`,
  receipt_evidence: `select p.id,l.item_id,l.order_qty,coalesce(sum(m.quantity),0)::text as received_quantity,
    count(m.id)::int as movement_count from restock_plans p join restock_plan_items l on l.plan_id=p.id
    left join inventory_movements m on m.item_id=l.item_id and m.movement_type='Received'
    and m.reference='PLAN-'||upper(left(p.id::text,8)) where p.status='received' and l.order_qty>0
    group by p.id,l.item_id,l.order_qty having count(m.id)<>1 or coalesce(sum(m.quantity),0)<>l.order_qty`,
  receipt_reference_collisions: `select upper(left(id::text,8)) as prefix,count(*)::int as plans
    from restock_plans group by upper(left(id::text,8)) having count(*)>1`,
  profile_summary: `select role,is_active,count(*)::int as profiles from user_profiles group by role,is_active order by role,is_active`,
  profile_auth_consistency: `select p.id,'missing_auth_user' as concern from user_profiles p left join auth.users u on u.id=p.id where u.id is null
    union all select u.id,'missing_profile' from auth.users u left join user_profiles p on p.id=u.id where p.id is null
    union all select p.id,'email_mismatch' from user_profiles p join auth.users u on u.id=p.id where p.email<>coalesce(u.email,'')`,
  historical_actor_gaps: `select distinct m.performed_by_user_id from inventory_movements m left join user_profiles p on p.id=m.performed_by_user_id
    where m.performed_by_user_id is not null and p.id is null`,
  orphans: `select 'component_specs.item' as relationship,count(*)::int as orphans from component_specs s left join inventory_items i on i.id=s.item_id and i.category_key=s.category_key where i.id is null
    union all select 'component_specs.definition',count(*)::int from component_specs s left join spec_definitions d on d.category_key=s.category_key and d.spec_key=s.spec_key where d.spec_key is null
    union all select 'inventory_items.category',count(*)::int from inventory_items i left join component_categories c on c.key=i.category_key where c.key is null
    union all select 'inventory_movements.item',count(*)::int from inventory_movements m left join inventory_items i on i.id=m.item_id where i.id is null
    union all select 'pc_build_components.build',count(*)::int from pc_build_components c left join pc_builds b on b.id=c.build_id where b.id is null
    union all select 'pc_build_components.item',count(*)::int from pc_build_components c left join inventory_items i on i.id=c.item_id and i.category_key=c.category_key where c.item_id is not null and i.id is null
    union all select 'optimization_runs.build',count(*)::int from optimization_runs r left join pc_builds b on b.id=r.build_id where r.build_id is not null and b.id is null
    union all select 'restock_plan_items.plan',count(*)::int from restock_plan_items l left join restock_plans p on p.id=l.plan_id where p.id is null
    union all select 'restock_plan_items.item',count(*)::int from restock_plan_items l left join inventory_items i on i.id=l.item_id where i.id is null`,
  custom_migration_history: `select name,applied_at from unitworks_meta.applied_migrations order by name`,
  supabase_migration_history: `select version from supabase_migrations.schema_migrations order by version`
};

export async function collectAudit(db) {
  const report = { format: 1, startedAt: new Date().toISOString(), migrations: migrationManifest(), checks: {}, errors: {} };
  for (const [name, sql] of Object.entries(CHECKS)) {
    await db.query('savepoint audit_check');
    try { report.checks[name] = (await db.query(sql)).rows; }
    catch (e) { await db.query('rollback to savepoint audit_check'); report.errors[name] = e.code || 'AUDIT_CHECK_FAILED'; }
    finally { await db.query('release savepoint audit_check'); }
  }
  report.fingerprints = {};
  for (const table of TABLES) {
    // Fixed allowlist, not user-controlled identifiers. Hashes avoid logging private row data.
    report.fingerprints[table] = (await db.query(`select count(*)::int as rows,
      md5(coalesce(string_agg(row_to_json(t)::text,E'\n' order by row_to_json(t)::text),'')) as md5 from public.${table} t`)).rows[0];
  }
  report.finishedAt = new Date().toISOString();
  return report;
}

export async function withLiveReadOnly(fn) {
  const cfg = loadConfig({ skipAuthConfig: true });
  if (cfg.dbDriver !== 'postgres') throw new Error('LIVE_POSTGRES_REQUIRED');
  const client = new pg.Client({ connectionString: cfg.databaseUrl, ssl: cfg.databaseSsl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000, application_name: 'unitworks-phase2-readonly' });
  try {
    await client.connect();
    await client.query('begin isolation level repeatable read read only');
    await client.query("set local statement_timeout='30s'");
    await client.query("set local lock_timeout='3s'");
    const mode = (await client.query("select current_setting('transaction_read_only') as read_only, current_setting('server_version') as version")).rows[0];
    if (mode.read_only !== 'on') throw new Error('READ_ONLY_REQUIRED');
    return await fn(client, mode);
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const out = resolve(process.argv[2] || '.data/audits/phase2-audit.json');
    const report = await withLiveReadOnly(async (db, mode) => ({ ...await collectAudit(db), connection: mode }));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ status: 'audit_saved', path: out, readOnly: report.connection.read_only,
      completedChecks: Object.keys(report.checks).length, unavailableChecks: report.errors, fingerprints: report.fingerprints }));
  } catch (e) {
    // Never print raw database errors: they can contain connection details or row values.
    console.error(JSON.stringify({ status: 'audit_failed', code: e.code || 'AUDIT_FAILED' }));
    process.exitCode = 1;
  }
}
