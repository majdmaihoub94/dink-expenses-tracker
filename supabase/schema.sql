-- ============================================================================
-- DINX — shared household budget tracker
-- Run this once against a fresh Supabase project (SQL Editor → New query).
-- It is idempotent enough to re-run during development.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type txn_kind as enum ('expense', 'income');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Salary is the predictable monthly money; "extra" is everything on top
  -- (bonus, freelance, refunds, gifts) so it can be reported separately.
  create type income_type as enum ('salary', 'extra', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method_type as enum ('bank', 'credit', 'cash', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_type as enum (
    'expense_added',
    'income_added',
    'planned_paid',
    'savings_added',
    'goal_reached',
    'member_joined'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Households + people
-- ----------------------------------------------------------------------------
create table if not exists households (
  id               uuid primary key default gen_random_uuid(),
  name             text not null default 'Our household',
  currency         text not null default 'GBP',
  -- The budget month runs from this day of the month to the day before it
  -- next month (default: 25th → 24th, matching a 25th payday).
  cycle_start_day  smallint not null default 25 check (cycle_start_day between 1 and 28),
  -- 'end'   => 25 Apr–24 May is labelled "May"  (money you were paid for May)
  -- 'start' => 25 Apr–24 May is labelled "April"
  cycle_label_mode text not null default 'end' check (cycle_label_mode in ('start', 'end')),
  invite_code      text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  -- Pre-fills the "shared cost" toggle on new expenses. Off by default since
  -- most day-to-day spending is personal, not joint.
  default_expense_shared boolean not null default false,
  default_split_percent  smallint not null default 50 check (default_split_percent between 0 and 100),
  created_at       timestamptz not null default now()
);

create table if not exists profiles (
  id                   uuid primary key references auth.users on delete cascade,
  display_name         text not null default 'Me',
  emoji                text not null default '🙂',
  color                text not null default '#7C5CFA',
  household_id         uuid references households on delete set null,
  default_payment_method_id uuid,
  -- Notification preferences (per person, so one partner can mute).
  notify_partner_expense boolean not null default true,
  notify_partner_income  boolean not null default true,
  notify_planned_paid    boolean not null default true,
  notify_savings         boolean not null default true,
  created_at           timestamptz not null default now()
);

create index if not exists profiles_household_idx on profiles (household_id);

-- ----------------------------------------------------------------------------
-- Reference data (per household, fully editable in-app)
-- ----------------------------------------------------------------------------
create table if not exists categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  name         text not null,
  emoji        text not null default '🏷️',
  color        text not null default '#EDE9FE',
  kind         txn_kind not null default 'expense',
  -- Soft per-cycle spending cap. Null = untracked.
  monthly_budget numeric(12, 2),
  sort_order   int not null default 0,
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (household_id, name, kind)
);

create index if not exists categories_household_idx on categories (household_id) where archived = false;

create table if not exists payment_methods (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  name         text not null,
  type         payment_method_type not null default 'bank',
  color        text not null default '#3B2A50',
  -- Null = shared/household account, otherwise it belongs to one person.
  owner_id     uuid references profiles on delete set null,
  is_default   boolean not null default false,
  archived     boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);

create index if not exists payment_methods_household_idx on payment_methods (household_id) where archived = false;

alter table profiles
  drop constraint if exists profiles_default_payment_method_fk;
alter table profiles
  add constraint profiles_default_payment_method_fk
  foreign key (default_payment_method_id) references payment_methods on delete set null;

-- ----------------------------------------------------------------------------
-- Transactions
-- ----------------------------------------------------------------------------
create table if not exists transactions (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households on delete cascade,
  kind              txn_kind not null default 'expense',
  -- Always stored positive; `kind` carries the sign.
  amount            numeric(12, 2) not null check (amount >= 0),
  -- Optional VAT / tax portion, shown under the amount like the reference UI.
  tax_amount        numeric(12, 2) not null default 0 check (tax_amount >= 0),
  income_kind       income_type,
  category_id       uuid references categories on delete set null,
  payment_method_id uuid references payment_methods on delete set null,
  -- Who the money belongs to. Defaults to the logger but can be the partner.
  paid_by           uuid not null references profiles on delete cascade,
  -- Who actually tapped "save". Kept for the activity feed and audit trail.
  created_by        uuid not null references profiles on delete cascade,
  merchant          text,
  note              text,
  occurred_on       date not null default current_date,
  -- Shared costs count toward the joint balance; personal ones do not.
  is_shared         boolean not null default true,
  -- Percent of a shared cost carried by `paid_by` (50 = split down the middle).
  split_percent     smallint not null default 50 check (split_percent between 0 and 100),
  created_at        timestamptz not null default now()
);

create index if not exists transactions_household_date_idx
  on transactions (household_id, occurred_on desc);
create index if not exists transactions_category_idx on transactions (category_id);
create index if not exists transactions_paid_by_idx on transactions (paid_by);

-- ----------------------------------------------------------------------------
-- Expected / recurring expenses ("planned")
-- ----------------------------------------------------------------------------
create table if not exists planned_expenses (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households on delete cascade,
  name              text not null,
  amount            numeric(12, 2) not null check (amount >= 0),
  category_id       uuid references categories on delete set null,
  payment_method_id uuid references payment_methods on delete set null,
  -- Who is expected to pay it. Null = either of us.
  owner_id          uuid references profiles on delete set null,
  -- Day of the month it is normally due, used for ordering and reminders.
  due_day           smallint check (due_day between 1 and 31),
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists planned_expenses_household_idx on planned_expenses (household_id) where active = true;

-- One row per planned expense per budget cycle, created when it is ticked off.
create table if not exists planned_payments (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households on delete cascade,
  planned_expense_id uuid not null references planned_expenses on delete cascade,
  -- First date of the budget cycle this payment settles (e.g. 2026-07-25).
  cycle_start        date not null,
  amount             numeric(12, 2) not null check (amount >= 0),
  paid_by            uuid not null references profiles on delete cascade,
  created_by         uuid not null references profiles on delete cascade,
  -- The expense row this generated, so the money shows up in the totals too.
  transaction_id     uuid references transactions on delete set null,
  paid_at            timestamptz not null default now(),
  unique (planned_expense_id, cycle_start)
);

create index if not exists planned_payments_cycle_idx on planned_payments (household_id, cycle_start);

-- Reusable one-tap expense templates. Distinct from planned_expenses: those
-- are bills you tick off once per cycle, these are shortcuts you can log any
-- number of times, whenever you like.
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

-- ----------------------------------------------------------------------------
-- Savings
-- ----------------------------------------------------------------------------
create table if not exists savings_goals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households on delete cascade,
  name          text not null,
  emoji         text not null default '🎯',
  color         text not null default '#7C5CFA',
  target_amount numeric(12, 2) not null check (target_amount > 0),
  target_date   date,
  -- Optional per-cycle contribution target, used for "on track / behind".
  monthly_target numeric(12, 2),
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists savings_goals_household_idx on savings_goals (household_id) where archived = false;

create table if not exists savings_contributions (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households on delete cascade,
  goal_id           uuid not null references savings_goals on delete cascade,
  -- Negative amounts are withdrawals, so the running total stays honest.
  amount            numeric(12, 2) not null,
  paid_by           uuid not null references profiles on delete cascade,
  created_by        uuid not null references profiles on delete cascade,
  payment_method_id uuid references payment_methods on delete set null,
  note              text,
  occurred_on       date not null default current_date,
  created_at        timestamptz not null default now()
);

create index if not exists savings_contributions_goal_idx on savings_contributions (goal_id, occurred_on desc);

-- ----------------------------------------------------------------------------
-- Smart adaptive budgeting
--
-- household_budgets: income + savings target, one row per household.
-- budget_ai_cache: the last AI-generated read of those numbers (recovery
-- recommendations, forecast, UK / Isle of Man tips), regenerated on demand
-- rather than on every page load — see src/lib/budget-ai.ts.
-- ----------------------------------------------------------------------------
create table if not exists household_budgets (
  household_id          uuid primary key references households on delete cascade,
  monthly_income         numeric(12, 2) not null default 0 check (monthly_income >= 0),
  savings_target_type    text not null default 'percent'
    check (savings_target_type in ('percent', 'amount')),
  savings_target_value   numeric(12, 2) not null default 20 check (savings_target_value >= 0),
  updated_by             uuid references profiles on delete set null,
  updated_at             timestamptz not null default now()
);

create table if not exists budget_ai_cache (
  household_id uuid primary key references households on delete cascade,
  cycle_key    text not null,
  input_hash   text not null,
  payload      jsonb not null,
  generated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Activity feed + push subscriptions
-- ----------------------------------------------------------------------------
create table if not exists activity_events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  type         activity_type not null,
  actor_id     uuid not null references profiles on delete cascade,
  -- Denormalised copy of what happened, so the feed survives deletes.
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists activity_household_idx on activity_events (household_id, created_at desc);

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx on push_subscriptions (profile_id);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- SECURITY DEFINER so RLS policies can ask "is this my household?" without
-- re-entering the policy on `profiles` and recursing.
create or replace function current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from profiles where id = auth.uid();
$$;

create or replace function is_my_household(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target is not null and target = (select household_id from profiles where id = auth.uid());
$$;

-- Every new auth user gets a profile row automatically.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Seeds a brand new household with sensible categories and the UK accounts
-- DINX was built around, then moves the caller into it.
create or replace function create_household(household_name text default 'Our household')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  revolut_id uuid;
begin
  insert into households (name) values (coalesce(nullif(household_name, ''), 'Our household'))
  returning id into new_id;

  insert into categories (household_id, name, emoji, color, kind, sort_order) values
    (new_id, 'Groceries',      '🛒', '#E8F5E9', 'expense', 10),
    (new_id, 'Food & Drink',   '🍽️', '#FFF3E0', 'expense', 20),
    (new_id, 'Transport',      '🚗', '#E3F2FD', 'expense', 30),
    (new_id, 'Rent & Bills',   '🏠', '#EDE7F6', 'expense', 40),
    (new_id, 'Clothing',       '👕', '#E1F5FE', 'expense', 50),
    (new_id, 'Electronics',    '📱', '#ECEFF1', 'expense', 60),
    (new_id, 'Health',         '💊', '#FCE4EC', 'expense', 70),
    (new_id, 'Subscriptions',  '📺', '#F3E5F5', 'expense', 80),
    (new_id, 'Personal care',  '💇', '#FFF8E1', 'expense', 90),
    (new_id, 'Gifts',          '🎁', '#FFEBEE', 'expense', 100),
    (new_id, 'Travel',         '✈️', '#E0F7FA', 'expense', 110),
    (new_id, 'Other',          '🏷️', '#EEEEEE', 'expense', 999),
    (new_id, 'Salary',         '💼', '#E8F5E9', 'income',  10),
    (new_id, 'Bonus',          '✨', '#FFF3E0', 'income',  20),
    (new_id, 'Refund',         '↩️', '#E3F2FD', 'income',  30),
    (new_id, 'Other income',   '💰', '#EEEEEE', 'income',  999);

  insert into payment_methods (household_id, name, type, color, is_default, sort_order) values
    (new_id, 'Revolut',     'bank',   '#1F1F1F', true,  10),
    (new_id, 'Lloyds',      'bank',   '#006A4D', false, 20),
    (new_id, 'HSBC Credit', 'credit', '#DB0011', false, 30),
    (new_id, 'Cash',        'cash',   '#6B7280', false, 40);

  select id into revolut_id from payment_methods
   where household_id = new_id and name = 'Revolut';

  update profiles
     set household_id = new_id,
         default_payment_method_id = revolut_id
   where id = auth.uid();

  insert into activity_events (household_id, type, actor_id, payload)
  values (new_id, 'member_joined', auth.uid(), jsonb_build_object('household', household_name));

  return new_id;
end;
$$;

-- Partner joins with the code shown on the profile screen.
create or replace function join_household(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  default_pm uuid;
begin
  select id into target from households where invite_code = upper(trim(code));
  if target is null then
    raise exception 'Invalid invite code';
  end if;

  select id into default_pm from payment_methods
   where household_id = target and is_default and not archived
   limit 1;

  update profiles
     set household_id = target,
         default_payment_method_id = coalesce(default_payment_method_id, default_pm)
   where id = auth.uid();

  insert into activity_events (household_id, type, actor_id, payload)
  values (target, 'member_joined', auth.uid(), '{}'::jsonb);

  return target;
end;
$$;

-- ----------------------------------------------------------------------------
-- Row level security — everything is scoped to the caller's household.
-- ----------------------------------------------------------------------------
alter table households            enable row level security;
alter table profiles              enable row level security;
alter table categories            enable row level security;
alter table payment_methods       enable row level security;
alter table transactions          enable row level security;
alter table planned_expenses      enable row level security;
alter table planned_payments      enable row level security;
alter table fixed_expenses        enable row level security;
alter table savings_goals         enable row level security;
alter table savings_contributions enable row level security;
alter table household_budgets     enable row level security;
alter table budget_ai_cache       enable row level security;
alter table activity_events       enable row level security;
alter table push_subscriptions    enable row level security;

drop policy if exists households_rw on households;
create policy households_rw on households
  for all using (is_my_household(id)) with check (is_my_household(id));

-- You can always see yourself; you can also see whoever shares your household.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select using (id = auth.uid() or is_my_household(household_id));

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles
  for insert with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'payment_methods', 'transactions', 'planned_expenses',
    'planned_payments', 'fixed_expenses', 'savings_goals',
    'savings_contributions', 'household_budgets', 'budget_ai_cache',
    'activity_events'
  ] loop
    execute format('drop policy if exists %I_rw on %I', t, t);
    execute format(
      'create policy %I_rw on %I for all using (is_my_household(household_id)) with check (is_my_household(household_id))',
      t, t
    );
  end loop;
end $$;

drop policy if exists push_subscriptions_rw on push_subscriptions;
create policy push_subscriptions_rw on push_subscriptions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Grants
--
-- Supabase ships default privileges that expose new public tables to the API
-- roles, but they only fire for tables created by the `postgres` role. Run the
-- schema as anything else and every request fails with "permission denied for
-- table". Granting explicitly makes this work whoever applies it.
--
-- These are table-level privileges only. The RLS policies above still decide
-- which rows each person can actually touch.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  households,
  profiles,
  categories,
  payment_methods,
  transactions,
  planned_expenses,
  planned_payments,
  fixed_expenses,
  savings_goals,
  savings_contributions,
  household_budgets,
  budget_ai_cache,
  activity_events,
  push_subscriptions
to authenticated;

grant execute on function current_household_id() to authenticated;
grant execute on function is_my_household(uuid) to authenticated;
grant execute on function create_household(text) to authenticated;
grant execute on function join_household(text) to authenticated;

-- Anything added to this schema later inherits the same access.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- ----------------------------------------------------------------------------
-- Realtime — drives the live badge when your partner logs something.
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table transactions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table activity_events;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table savings_contributions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table planned_payments;
exception when duplicate_object then null; end $$;
