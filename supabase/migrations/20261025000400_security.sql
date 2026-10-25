-- Access model: the application has NO end-user authentication yet. All reads and writes go through
-- the Express backend, which connects to Postgres with a server-only connection string.
-- Row Level Security is enabled on every table with no policies, so the public Supabase Data API
-- (anon / authenticated keys) can neither read nor write application data. Functions are not
-- executable by those roles either.

alter table component_categories enable row level security;
alter table spec_definitions     enable row level security;
alter table inventory_items      enable row level security;
alter table component_specs      enable row level security;
alter table inventory_movements  enable row level security;
alter table pc_builds            enable row level security;
alter table pc_build_components  enable row level security;
alter table optimization_runs    enable row level security;
alter table restock_plans        enable row level security;
alter table restock_plan_items   enable row level security;

revoke execute on all functions in schema public from public;

-- anon / authenticated exist on Supabase; skip quietly on plain Postgres (e.g. local tests).
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke execute on all functions in schema public from %I', r);
    end if;
  end loop;
end $$;
