-- REVIEW COPY ONLY. Not an applied migration. Do not run against production
-- before the Phase 2 review, backup/recovery prerequisites, and explicit approval.
-- Test on an isolated database first. Existing migrations remain unchanged.
-- Historical proposal: the tested implementation now lives in
-- supabase/migrations/20261025000600_data_integrity_hardening.sql.
-- Do not apply both scripts. Use the migration only after deployment approval.
begin;

-- A: owner-specific defaults. These statements affect future objects only.
-- Confirm postgres is the actual migration owner before approval. Managed
-- supabase_admin defaults are intentionally outside this application's changes.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
-- PUBLIC's built-in function EXECUTE default is global; a schema-scoped revoke
-- cannot override it. This line affects future postgres-owned functions in ALL
-- schemas, so explicitly review that scope. Existing grants remain unchanged.
alter default privileges for role postgres revoke execute on functions from public;

-- B: enforce saved snapshot totals at transaction end, after all child rows
-- have been inserted. Current row-level checks do not enforce these sums.
create function public.check_saved_snapshot_total() returns trigger
language plpgsql set search_path = public as $$
declare
  key_name text;
  affected text[] := array[]::text[];
  target_id text;
  parent_total numeric;
  child_total numeric;
begin
  key_name := case tg_table_name when 'pc_build_components' then 'build_id'
    when 'restock_plan_items' then 'plan_id' else 'id' end;
  if tg_op <> 'INSERT' then affected := array_append(affected,to_jsonb(old)->>key_name); end if;
  if tg_op <> 'DELETE' then affected := array_append(affected,to_jsonb(new)->>key_name); end if;
  for target_id in select distinct unnest(affected) loop
    if tg_table_name in ('pc_builds','pc_build_components') then
      select total_price into parent_total from pc_builds where id=target_id::uuid for update;
      if not found then continue; end if; -- deleting a parent cascades its lines
      select coalesce(sum(unit_price),0) into child_total from pc_build_components where build_id=target_id::uuid;
    else
      select total_cost into parent_total from restock_plans where id=target_id::uuid for update;
      if not found then continue; end if;
      select coalesce(sum(order_cost),0) into child_total from restock_plan_items where plan_id=target_id::uuid;
    end if;
    if parent_total <> child_total then
      raise exception 'Saved snapshot total differs from its component lines' using errcode='23514';
    end if;
  end loop;
  return null;
end $$;

create constraint trigger pc_builds_check_total after insert or update or delete on public.pc_builds
  deferrable initially deferred for each row execute function public.check_saved_snapshot_total();
create constraint trigger pc_build_components_check_total after insert or update or delete on public.pc_build_components
  deferrable initially deferred for each row execute function public.check_saved_snapshot_total();
create constraint trigger restock_plans_check_total after insert or update or delete on public.restock_plans
  deferrable initially deferred for each row execute function public.check_saved_snapshot_total();
create constraint trigger restock_plan_items_check_total after insert or update or delete on public.restock_plan_items
  deferrable initially deferred for each row execute function public.check_saved_snapshot_total();
revoke execute on function public.check_saved_snapshot_total() from public, anon, authenticated;

commit;
