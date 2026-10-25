-- Authentication support: user profiles with roles, and attribution of sensitive actions.
--
-- Identity comes from Supabase Auth (auth.users). Each auth user gets a profile automatically, with
-- role = NULL, meaning "signed in but no access". Only an administrator (via the server-side
-- script or SQL) can assign 'admin' or 'staff'. Nothing in the API lets a user change a role.
--
-- Attribution: the Express backend verifies the user's access token, then runs each write inside a
-- transaction that sets unitworks.actor_id. Column defaults and the stock functions read it through
-- current_actor_id(). Browser clients cannot set it: they have no database access at all.

create table user_profiles (
  id         uuid primary key,
  email      text not null default '',
  full_name  text check (full_name is null or length(btrim(full_name)) between 1 and 120),
  role       text check (role in ('admin', 'staff')), -- NULL = no access until a role is assigned
  is_active  boolean not null default true,           -- false = blocked immediately, even with a valid token
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index user_profiles_role_idx on user_profiles (role) where role is not null;

create trigger user_profiles_updated_at before update on user_profiles
  for each row execute function set_updated_at();

create function current_actor_id() returns uuid
language sql stable set search_path = public as $$
  select nullif(current_setting('unitworks.actor_id', true), '')::uuid
$$;

-- Who did it. Movements keep the id even if the user is later removed (the ledger is append-only,
-- so it cannot take part in ON DELETE SET NULL); the other tables use a nullable foreign key.
alter table inventory_movements add column performed_by_user_id uuid default current_actor_id();
create index inventory_movements_user_idx on inventory_movements (performed_by_user_id) where performed_by_user_id is not null;

alter table inventory_items add column archived_by uuid references user_profiles(id) on delete set null;
alter table pc_builds add column created_by uuid default current_actor_id() references user_profiles(id) on delete set null;
alter table optimization_runs add column created_by uuid default current_actor_id() references user_profiles(id) on delete set null;
alter table restock_plans add column created_by uuid default current_actor_id() references user_profiles(id) on delete set null;
alter table restock_plans add column received_by uuid references user_profiles(id) on delete set null;

create or replace function archive_inventory_item(p_id text) returns void
language plpgsql set search_path = public as $$
begin
  update inventory_items set archived_at = now(), archived_by = current_actor_id() where id = p_id and archived_at is null;
  if not found then
    raise exception 'Product % not found', p_id using errcode = 'UW404';
  end if;
end $$;

create or replace function receive_restock_plan(p_plan_id uuid, p_user text default 'system') returns integer
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
  update restock_plans set status = 'received', received_at = now(), received_by = current_actor_id() where id = p_plan_id;
  return n;
end $$;

-- Link profiles to Supabase Auth where it exists (skipped on plain Postgres, e.g. local PGlite).
do $$
begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users not found: user_profiles is not linked to Supabase Auth on this database';
    return;
  end if;

  alter table public.user_profiles
    add constraint user_profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;

  create function public.handle_auth_user_created() returns trigger
  language plpgsql security definer set search_path = public as $f$
  begin
    insert into public.user_profiles (id, email, full_name)
    values (new.id, coalesce(new.email, ''), nullif(btrim(new.raw_user_meta_data->>'full_name'), ''))
    on conflict (id) do nothing;
    return new;
  end $f$;

  create function public.handle_auth_user_email_changed() returns trigger
  language plpgsql security definer set search_path = public as $f$
  begin
    update public.user_profiles set email = coalesce(new.email, '') where id = new.id;
    return new;
  end $f$;

  create trigger unitworks_on_auth_user_created after insert on auth.users
    for each row execute function public.handle_auth_user_created();
  create trigger unitworks_on_auth_user_email_changed after update of email on auth.users
    for each row execute function public.handle_auth_user_email_changed();

  -- Profiles for accounts that already exist (all start without access)
  insert into public.user_profiles (id, email)
  select id, coalesce(email, '') from auth.users
  on conflict (id) do nothing;
end $$;

-- Same deny-by-default posture as the other tables
alter table user_profiles enable row level security;
revoke execute on all functions in schema public from public;
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke execute on all functions in schema public from %I', r);
    end if;
  end loop;
end $$;
