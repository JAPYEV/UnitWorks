-- Integrity triggers and atomic operations.
-- Every stock change goes through adjust_stock(), which updates inventory_items.stock and appends
-- an inventory_movements row in the same transaction. A guard trigger rejects any other stock write,
-- so stock always equals the sum of the movement ledger.
--
-- Error codes raised for the API layer:
--   UW404 record not found · UW409 conflicting state (e.g. insufficient stock) · UW422 invalid input

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger inventory_items_updated_at before update on inventory_items
  for each row execute function set_updated_at();

create function guard_stock_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('unitworks.stock_change', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.stock <> 0 then
    raise exception 'New items start at 0 stock; opening stock is recorded through create_inventory_item()' using errcode = 'UW422';
  end if;
  if tg_op = 'UPDATE' and new.stock is distinct from old.stock then
    raise exception 'Stock can only change through adjust_stock() so every change is recorded' using errcode = 'UW422';
  end if;
  return new;
end $$;

create trigger inventory_items_guard_stock before insert or update of stock on inventory_items
  for each row execute function guard_stock_change();

create function prevent_ledger_rewrite() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Stock movements are append-only; record a correcting adjustment instead' using errcode = 'UW422';
end $$;

create trigger inventory_movements_append_only before update or delete on inventory_movements
  for each row execute function prevent_ledger_rewrite();

create function validate_component_spec() returns trigger
language plpgsql set search_path = public as $$
declare
  d spec_definitions;
begin
  select * into d from spec_definitions where category_key = new.category_key and spec_key = new.spec_key;
  if not found then
    raise exception 'Unknown specification "%" for category %', new.spec_key, new.category_key using errcode = 'UW422';
  end if;
  if d.data_type = 'number' and new.value !~ '^\d+(\.\d+)?$' then
    raise exception '% must be a non-negative number', d.label using errcode = 'UW422';
  end if;
  if d.data_type = 'select' and not (new.value = any (d.options)) then
    raise exception '% must be one of: %', d.label, array_to_string(d.options, ', ') using errcode = 'UW422';
  end if;
  return new;
end $$;

create trigger component_specs_validate before insert or update on component_specs
  for each row execute function validate_component_spec();

-- ---------------------------------------------------------------------------
-- Stock operations
-- ---------------------------------------------------------------------------
create function adjust_stock(
  p_item_id text, p_delta integer, p_type movement_type,
  p_note text default '', p_reference text default null, p_user text default 'system'
) returns inventory_movements
language plpgsql set search_path = public as $$
declare
  v_stock integer;
  v_row   inventory_movements;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'Quantity change must be a non-zero whole number' using errcode = 'UW422';
  end if;
  select stock into v_stock from inventory_items where id = p_item_id and archived_at is null for update;
  if not found then
    raise exception 'Product % not found', p_item_id using errcode = 'UW404';
  end if;
  if v_stock + p_delta < 0 then
    raise exception 'Only % units of % are in stock', v_stock, p_item_id using errcode = 'UW409';
  end if;
  perform set_config('unitworks.stock_change', 'on', true);
  update inventory_items set stock = v_stock + p_delta where id = p_item_id;
  perform set_config('unitworks.stock_change', 'off', true);
  insert into inventory_movements (item_id, movement_type, quantity, stock_after, note, reference, performed_by)
  values (p_item_id, p_type, p_delta, v_stock + p_delta, coalesce(p_note, ''), p_reference,
          coalesce(nullif(btrim(p_user), ''), 'system'))
  returning * into v_row;
  return v_row;
end $$;

-- Record a physical count: computes the difference against current stock under a row lock.
-- Returns null when the count already matches (nothing is recorded).
create function set_stock_count(p_item_id text, p_count integer, p_note text, p_user text default 'system')
returns inventory_movements
language plpgsql set search_path = public as $$
declare
  v_stock integer;
begin
  if p_count is null or p_count < 0 then
    raise exception 'Counted quantity must be 0 or more' using errcode = 'UW422';
  end if;
  select stock into v_stock from inventory_items where id = p_item_id and archived_at is null for update;
  if not found then
    raise exception 'Product % not found', p_item_id using errcode = 'UW404';
  end if;
  if p_count = v_stock then
    return null;
  end if;
  return adjust_stock(p_item_id, p_count - v_stock, 'Adjustment', p_note, null, p_user);
end $$;

-- Receive several lines at once; if any line fails, nothing is applied.
create function receive_items(p_lines jsonb, p_note text, p_reference text default null, p_user text default 'system')
returns integer
language plpgsql set search_path = public as $$
declare
  l jsonb;
  n integer := 0;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line is required' using errcode = 'UW422';
  end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_lines) x) <> jsonb_array_length(p_lines) then
    raise exception 'Each product may appear only once' using errcode = 'UW422';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((l->>'qty')::integer, 0) <= 0 then
      raise exception 'Received quantity for % must be positive', l->>'id' using errcode = 'UW422';
    end if;
    perform adjust_stock(l->>'id', (l->>'qty')::integer, 'Received', p_note, p_reference, p_user);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Inventory item lifecycle
-- ---------------------------------------------------------------------------
create function replace_item_specs(p_item_id text, p_specs jsonb) returns void
language plpgsql set search_path = public as $$
declare
  v_cat text;
  k     text;
  v     jsonb;
begin
  select category_key into v_cat from inventory_items where id = p_item_id;
  delete from component_specs where item_id = p_item_id;
  if p_specs is null or jsonb_typeof(p_specs) <> 'object' then
    return;
  end if;
  for k, v in select * from jsonb_each(p_specs) loop
    continue when v = 'null'::jsonb or btrim(v #>> '{}') = '';
    insert into component_specs (item_id, category_key, spec_key, value) values (p_item_id, v_cat, k, btrim(v #>> '{}'));
  end loop;
end $$;

create function create_inventory_item(p jsonb, p_user text default 'system') returns text
language plpgsql set search_path = public as $$
declare
  v_id    text := p->>'id';
  v_stock integer := coalesce((p->>'stock')::integer, 0);
begin
  if v_stock < 0 then
    raise exception 'Opening stock cannot be negative' using errcode = 'UW422';
  end if;
  insert into inventory_items (id, sku, category_key, brand, name, price, unit_cost, stock, min_stock, daily_sales,
                               lead_time_days, moq, perf_gaming, perf_work, perf_score)
  values (v_id, coalesce(p->>'sku', upper(v_id)), p->>'category', btrim(p->>'brand'), btrim(p->>'name'),
          (p->>'price')::numeric, (p->>'cost')::numeric, 0, (p->>'minStock')::integer, (p->>'dailySales')::numeric,
          (p->>'leadTime')::integer, (p->>'moq')::integer,
          (p->'perf'->>'gaming')::smallint, (p->'perf'->>'work')::smallint, (p->'perf'->>'score')::smallint);
  perform replace_item_specs(v_id, p->'specs');
  if v_stock > 0 then
    perform adjust_stock(v_id, v_stock, 'Received', 'Initial stock for new product', null, p_user);
  end if;
  return v_id;
end $$;

create function update_inventory_item(p_id text, p jsonb) returns void
language plpgsql set search_path = public as $$
declare
  v_cat text;
begin
  select category_key into v_cat from inventory_items where id = p_id and archived_at is null;
  if not found then
    raise exception 'Product % not found', p_id using errcode = 'UW404';
  end if;
  if p ? 'stock' then
    raise exception 'Stock changes must be recorded as a stock adjustment' using errcode = 'UW422';
  end if;
  if p ? 'category' and p->>'category' <> v_cat then
    raise exception 'Category cannot change after creation' using errcode = 'UW422';
  end if;
  update inventory_items set
    name           = coalesce(btrim(p->>'name'), name),
    brand          = coalesce(btrim(p->>'brand'), brand),
    price          = coalesce((p->>'price')::numeric, price),
    unit_cost      = coalesce((p->>'cost')::numeric, unit_cost),
    min_stock      = coalesce((p->>'minStock')::integer, min_stock),
    daily_sales    = coalesce((p->>'dailySales')::numeric, daily_sales),
    lead_time_days = coalesce((p->>'leadTime')::integer, lead_time_days),
    moq            = coalesce((p->>'moq')::integer, moq)
  where id = p_id;
  if p ? 'specs' then
    perform replace_item_specs(p_id, p->'specs');
  end if;
end $$;

-- Items are archived rather than deleted so movement history and saved builds keep their references.
create function archive_inventory_item(p_id text) returns void
language plpgsql set search_path = public as $$
begin
  update inventory_items set archived_at = now() where id = p_id and archived_at is null;
  if not found then
    raise exception 'Product % not found', p_id using errcode = 'UW404';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Builds, optimization runs, restock plans
-- ---------------------------------------------------------------------------
create function save_pc_build(p jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  v_id uuid;
  c    jsonb;
begin
  insert into pc_builds (name, source, budget, total_price, compatibility_status, checks)
  values (btrim(p->>'name'), coalesce(p->>'source', 'builder'), (p->>'budget')::numeric, (p->>'totalPrice')::numeric,
          p->>'status', coalesce(p->'checks', '[]'::jsonb))
  returning id into v_id;
  for c in select * from jsonb_array_elements(coalesce(p->'components', '[]'::jsonb)) loop
    insert into pc_build_components (build_id, category_key, item_id, is_integrated_graphics, unit_price)
    values (v_id, c->>'category', nullif(c->>'itemId', ''), coalesce((c->>'integrated')::boolean, false), (c->>'unitPrice')::numeric);
  end loop;
  return v_id;
end $$;

create function save_optimization_run(p jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  v_build uuid;
  v_id    uuid;
begin
  if p ? 'build' and p->'build' <> 'null'::jsonb then
    v_build := save_pc_build(p->'build');
  end if;
  insert into optimization_runs (budget, use_case, priority_graphics, priority_processing, priority_memory, cpu_brand, gpu_brand,
                                 min_ram_gb, exclude_out_of_stock, prefer_unspent, feasible, score, total_price, build_id, stats, duration_ms)
  values ((p->>'budget')::numeric, p->>'useCase', (p->>'priorityGraphics')::smallint, (p->>'priorityProcessing')::smallint,
          (p->>'priorityMemory')::smallint, p->>'cpuBrand', p->>'gpuBrand', (p->>'minRam')::smallint, (p->>'excludeOOS')::boolean,
          (p->>'lean')::boolean, (p->>'feasible')::boolean, (p->>'score')::numeric, (p->>'totalPrice')::numeric, v_build,
          coalesce(p->'stats', '{}'::jsonb), (p->>'durationMs')::numeric)
  returning id into v_id;
  return v_id;
end $$;

create function save_restock_plan(p jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  v_id uuid;
  r    jsonb;
begin
  insert into restock_plans (budget, cover_days, total_cost, remaining)
  values ((p->>'budget')::numeric, (p->>'coverDays')::smallint, (p->>'totalCost')::numeric, (p->>'remaining')::numeric)
  returning id into v_id;
  for r in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    insert into restock_plan_items (plan_id, item_id, rank, urgency, decision, recommended_qty, order_qty, unit_cost, order_cost, reason)
    values (v_id, r->>'itemId', (r->>'rank')::smallint, (r->>'urgency')::smallint, r->>'decision', (r->>'recommendedQty')::integer,
            (r->>'orderQty')::integer, (r->>'unitCost')::numeric, (r->>'orderCost')::numeric, r->>'reason');
  end loop;
  return v_id;
end $$;

-- Applies every funded line of a draft plan as received stock, atomically, exactly once.
create function receive_restock_plan(p_plan_id uuid, p_user text default 'system') returns integer
language plpgsql set search_path = public as $$
declare
  v_status text;
  r        record;
  n        integer := 0;
begin
  select status into v_status from restock_plans where id = p_plan_id for update;
  if not found then
    raise exception 'Restock plan not found' using errcode = 'UW404';
  end if;
  if v_status <> 'draft' then
    raise exception 'This restock plan has already been received' using errcode = 'UW409';
  end if;
  for r in select item_id, order_qty from restock_plan_items where plan_id = p_plan_id and order_qty > 0 order by rank loop
    perform adjust_stock(r.item_id, r.order_qty, 'Received', 'Restock plan delivery',
                         'PLAN-' || upper(left(p_plan_id::text, 8)), p_user);
    n := n + 1;
  end loop;
  update restock_plans set status = 'received', received_at = now() where id = p_plan_id;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------------
create view inventory_items_with_specs with (security_invoker = true) as
select i.*,
       coalesce((select jsonb_object_agg(s.spec_key,
                          case when d.data_type = 'number' then to_jsonb(s.value::numeric) else to_jsonb(s.value) end)
                 from component_specs s
                 join spec_definitions d on d.category_key = s.category_key and d.spec_key = s.spec_key
                 where s.item_id = i.id), '{}'::jsonb) as specs
from inventory_items i;

-- Should always return zero rows with difference <> 0.
create view inventory_stock_audit with (security_invoker = true) as
select i.id, i.stock, coalesce(sum(m.quantity), 0)::integer as ledger_total, i.stock - coalesce(sum(m.quantity), 0)::integer as difference
from inventory_items i
left join inventory_movements m on m.item_id = i.id
group by i.id, i.stock;
