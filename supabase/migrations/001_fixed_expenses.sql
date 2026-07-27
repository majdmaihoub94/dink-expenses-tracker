-- ============================================================================
-- Fixed expenses — reusable one-tap expense templates.
--
-- Run this against an existing DINX project. Safe to re-run.
-- (It is also folded into supabase/schema.sql for fresh installs.)
--
-- Distinct from planned_expenses: those are bills you tick off once per cycle,
-- these are shortcuts you can log any number of times, whenever you like.
-- ============================================================================

create table if not exists fixed_expenses (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households on delete cascade,
  name              text not null,
  amount            numeric(12, 2) not null check (amount >= 0),
  category_id       uuid references categories on delete set null,
  payment_method_id uuid references payment_methods on delete set null,
  emoji             text not null default '⚡',
  -- Ordering hints, so the ones you actually use float to the front.
  use_count         int not null default 0,
  last_used_at      timestamptz,
  sort_order        int not null default 0,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (household_id, name)
);

create index if not exists fixed_expenses_household_idx
  on fixed_expenses (household_id) where archived = false;

alter table fixed_expenses enable row level security;

drop policy if exists fixed_expenses_rw on fixed_expenses;
create policy fixed_expenses_rw on fixed_expenses
  for all using (is_my_household(household_id)) with check (is_my_household(household_id));

-- Supabase's default privileges only fire for tables created by the `postgres`
-- role, so grant explicitly — the same omission that broke every other table.
grant select, insert, update, delete on fixed_expenses to authenticated;
