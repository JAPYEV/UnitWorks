-- UnitWorks schema: catalog, inventory, stock movements, builds, optimization runs, restock plans.
-- Monetary values use numeric (exact); quantities use integer with non-negative checks.

-- ---------------------------------------------------------------------------
-- Reference data: component categories and the specification fields each one uses
-- ---------------------------------------------------------------------------
create table component_categories (
  key        text primary key check (key ~ '^[a-z]+$'),
  label      text not null,
  icon       text not null,
  sort_order smallint not null unique
);

create table spec_definitions (
  category_key text not null references component_categories(key) on delete cascade,
  spec_key     text not null check (spec_key ~ '^[a-zA-Z0-9]+$'),
  label        text not null,
  data_type    text not null check (data_type in ('text', 'number', 'select')),
  unit         text,
  options      text[],
  sort_order   smallint not null,
  primary key (category_key, spec_key),
  check ((data_type = 'select') = (options is not null))
);

-- ---------------------------------------------------------------------------
-- Inventory items (sellable components)
-- ---------------------------------------------------------------------------
create table inventory_items (
  id             text primary key check (id ~ '^[a-z0-9-]{3,64}$'),
  sku            text not null unique,
  category_key   text not null references component_categories(key),
  brand          text not null check (length(btrim(brand)) > 0),
  name           text not null check (length(btrim(name)) >= 4),
  price          numeric(12, 2) not null check (price > 0),
  unit_cost      numeric(12, 2) not null check (unit_cost > 0),
  stock          integer not null default 0 check (stock >= 0),
  min_stock      integer not null default 0 check (min_stock >= 0),
  daily_sales    numeric(8, 2) not null default 0 check (daily_sales >= 0),
  lead_time_days integer not null check (lead_time_days >= 1),
  moq            integer not null default 1 check (moq >= 1),
  -- Illustrative 0-100 suitability indices used by the optimizer (not benchmarks)
  perf_gaming    smallint check (perf_gaming between 0 and 100),
  perf_work      smallint check (perf_work between 0 and 100),
  perf_score     smallint check (perf_score between 0 and 100),
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (unit_cost <= price),
  unique (id, category_key) -- target for composite foreign keys that pin an item to its category
);
create unique index inventory_items_active_name_uq on inventory_items (lower(name)) where archived_at is null;
create index inventory_items_category_idx on inventory_items (category_key) where archived_at is null;
create index inventory_items_stock_idx on inventory_items (stock, min_stock) where archived_at is null;

-- One row per known specification value. Unknown values are simply absent, which the
-- compatibility checks report as "cannot verify" instead of assuming compatibility.
create table component_specs (
  item_id      text not null,
  category_key text not null,
  spec_key     text not null,
  value        text not null check (length(btrim(value)) > 0),
  primary key (item_id, spec_key),
  foreign key (item_id, category_key) references inventory_items(id, category_key) on delete cascade,
  foreign key (category_key, spec_key) references spec_definitions(category_key, spec_key)
);

-- ---------------------------------------------------------------------------
-- Stock movements: append-only ledger. inventory_items.stock always equals the sum of quantities.
-- ---------------------------------------------------------------------------
create type movement_type as enum ('Opening', 'Received', 'Sale', 'Return', 'Adjustment');

create table inventory_movements (
  id            bigint generated always as identity primary key,
  item_id       text not null references inventory_items(id),
  movement_type movement_type not null,
  quantity      integer not null check (quantity <> 0),
  stock_after   integer not null check (stock_after >= 0),
  note          text not null default '',
  reference     text,
  performed_by  text not null default 'system',
  created_at    timestamptz not null default now(),
  check (movement_type <> 'Sale' or quantity < 0),
  check (movement_type not in ('Opening', 'Received', 'Return') or quantity > 0)
);
create index inventory_movements_item_idx on inventory_movements (item_id, created_at desc);
create index inventory_movements_created_idx on inventory_movements (created_at desc);

-- ---------------------------------------------------------------------------
-- Saved PC builds
-- ---------------------------------------------------------------------------
create table pc_builds (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (length(btrim(name)) between 1 and 120),
  source               text not null default 'builder' check (source in ('builder', 'search', 'optimizer')),
  budget               numeric(12, 2) check (budget > 0),
  total_price          numeric(12, 2) not null check (total_price >= 0),
  compatibility_status text not null check (compatibility_status in ('compatible', 'incompatible', 'incomplete', 'unverified')),
  checks               jsonb not null default '[]'::jsonb, -- snapshot of the rule results calculated at save time
  created_at           timestamptz not null default now()
);
create index pc_builds_created_idx on pc_builds (created_at desc);

create table pc_build_components (
  build_id               uuid not null references pc_builds(id) on delete cascade,
  category_key           text not null references component_categories(key),
  item_id                text,
  is_integrated_graphics boolean not null default false,
  unit_price             numeric(12, 2) not null check (unit_price >= 0), -- price when saved
  primary key (build_id, category_key),
  foreign key (item_id, category_key) references inventory_items(id, category_key),
  check ((item_id is null) = is_integrated_graphics),
  check (not is_integrated_graphics or category_key = 'gpu')
);
create index pc_build_components_item_idx on pc_build_components (item_id);

-- ---------------------------------------------------------------------------
-- Build optimizer runs (dynamic programming)
-- ---------------------------------------------------------------------------
create table optimization_runs (
  id                   uuid primary key default gen_random_uuid(),
  budget               numeric(12, 2) not null check (budget between 15000 and 500000),
  use_case             text not null check (use_case in ('Gaming', 'Programming', 'Office Work', 'Content Creation')),
  priority_graphics    smallint not null check (priority_graphics between 1 and 5),
  priority_processing  smallint not null check (priority_processing between 1 and 5),
  priority_memory      smallint not null check (priority_memory between 1 and 5),
  cpu_brand            text not null default 'Any' check (cpu_brand in ('Any', 'AMD', 'Intel')),
  gpu_brand            text not null default 'Any' check (gpu_brand in ('Any', 'NVIDIA', 'AMD')),
  min_ram_gb           smallint not null default 0 check (min_ram_gb in (0, 32, 64)),
  exclude_out_of_stock boolean not null default true,
  prefer_unspent       boolean not null default false,
  feasible             boolean not null,
  score                numeric(6, 2),
  total_price          numeric(12, 2) check (total_price >= 0),
  build_id             uuid references pc_builds(id) on delete set null,
  stats                jsonb not null default '{}'::jsonb, -- algorithm execution counters
  duration_ms          numeric(10, 2) check (duration_ms >= 0),
  created_at           timestamptz not null default now(),
  check (not feasible or (score is not null and total_price is not null)),
  check (total_price is null or total_price <= budget)
);
create index optimization_runs_created_idx on optimization_runs (created_at desc);

-- ---------------------------------------------------------------------------
-- Restock plans (greedy)
-- ---------------------------------------------------------------------------
create table restock_plans (
  id          uuid primary key default gen_random_uuid(),
  budget      numeric(14, 2) not null check (budget >= 0),
  cover_days  smallint not null check (cover_days in (7, 14, 30)),
  total_cost  numeric(14, 2) not null check (total_cost >= 0),
  remaining   numeric(14, 2) not null check (remaining >= 0),
  status      text not null default 'draft' check (status in ('draft', 'received')),
  received_at timestamptz,
  created_at  timestamptz not null default now(),
  check (total_cost + remaining = budget),
  check ((status = 'received') = (received_at is not null))
);
create index restock_plans_created_idx on restock_plans (created_at desc);

create table restock_plan_items (
  plan_id         uuid not null references restock_plans(id) on delete cascade,
  item_id         text not null references inventory_items(id),
  rank            smallint not null check (rank >= 1),
  urgency         smallint not null check (urgency between 0 and 100),
  decision        text not null check (decision in ('selected', 'partial', 'skipped')),
  recommended_qty integer not null check (recommended_qty > 0),
  order_qty       integer not null check (order_qty >= 0),
  unit_cost       numeric(12, 2) not null check (unit_cost > 0),
  order_cost      numeric(14, 2) not null check (order_cost >= 0),
  reason          text not null,
  primary key (plan_id, item_id),
  unique (plan_id, rank),
  check ((decision = 'skipped') = (order_qty = 0)),
  check (order_qty <= recommended_qty),
  check (order_cost = order_qty * unit_cost)
);
create index restock_plan_items_item_idx on restock_plan_items (item_id);
