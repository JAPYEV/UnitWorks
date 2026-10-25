-- Phase 2 follow-up. Review docs/phase2/REPORT.md and RECOVERY.md before live
-- deployment. Apply only after approval and verified full recovery preparation.
-- No historical rows are edited. Existing migrations remain unchanged.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Harden future objects owned by the role running migrations. The global
-- PUBLIC function default cannot be overridden by a schema-scoped revoke;
-- this affects future functions by this owner in every schema. Existing
-- objects and platform-managed owners' defaults are not changed.
alter default privileges revoke execute on functions from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('alter default privileges in schema public revoke all on tables from %I',r);
      execute format('alter default privileges in schema public revoke all on sequences from %I',r);
      execute format('alter default privileges in schema public revoke execute on functions from %I',r);
    end if;
  end loop;
end $$;

-- Fail rather than install guards over known inconsistent historical snapshots.
lock table pc_builds, pc_build_components, restock_plans, restock_plan_items in share row exclusive mode;
do $$
begin
  if exists(select 1 from pc_builds b left join pc_build_components c on c.build_id=b.id
    group by b.id,b.total_price having b.total_price<>coalesce(sum(c.unit_price),0))
    or exists(select 1 from restock_plans p left join restock_plan_items l on l.plan_id=p.id
    group by p.id,p.total_cost having p.total_cost<>coalesce(sum(l.order_cost),0)) then
    raise exception 'Existing saved totals require review before hardening' using errcode='23514';
  end if;
end $$;

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
  -- Stable lock order reduces deadlocks when moving a line between parents.
  for target_id in select distinct unnest(affected) order by 1 loop
    if tg_table_name in ('pc_builds','pc_build_components') then
      select total_price into parent_total from pc_builds where id=target_id::uuid for update;
      if not found then continue; end if;
      select coalesce(sum(unit_price),0) into child_total from pc_build_components where build_id=target_id::uuid;
    else
      select total_cost into parent_total from restock_plans where id=target_id::uuid for update;
      if not found then continue; end if;
      select coalesce(sum(order_cost),0) into child_total from restock_plan_items where plan_id=target_id::uuid;
    end if;
    if parent_total<>child_total then
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
revoke execute on function public.check_saved_snapshot_total() from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('revoke execute on function public.check_saved_snapshot_total() from %I',r);
    end if;
  end loop;
end $$;
