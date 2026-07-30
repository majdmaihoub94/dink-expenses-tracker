-- ============================================================================
-- Smart adaptive budgeting.
--
-- Run this against an existing DINX project. Safe to re-run.
-- (It is also folded into supabase/schema.sql for fresh installs.)
--
-- household_budgets: the household's income + savings target, entered once
-- and adjusted as it changes. One row per household.
--
-- budget_ai_cache: the last AI-generated read of that household's numbers
-- (recovery recommendations, forecast, region-specific tips). Regenerated on
-- demand rather than on every page load — see src/lib/budget-ai.ts.
-- ============================================================================

create table if not exists household_budgets (
  household_id          uuid primary key references households on delete cascade,
  monthly_income         numeric(12, 2) not null default 0 check (monthly_income >= 0),
  -- 'percent' of income, or a fixed 'amount' — whichever is easier to think in.
  savings_target_type    text not null default 'percent'
    check (savings_target_type in ('percent', 'amount')),
  savings_target_value   numeric(12, 2) not null default 20 check (savings_target_value >= 0),
  updated_by             uuid references profiles on delete set null,
  updated_at             timestamptz not null default now()
);

create table if not exists budget_ai_cache (
  household_id uuid primary key references households on delete cascade,
  -- The cycle this read was generated for, so a new cycle invalidates it.
  cycle_key    text not null,
  -- Hash of the inputs (income, target, category history, pace) — a cheap
  -- staleness check without diffing the whole payload.
  input_hash   text not null,
  payload      jsonb not null,
  generated_at timestamptz not null default now()
);

alter table household_budgets enable row level security;
alter table budget_ai_cache   enable row level security;

drop policy if exists household_budgets_rw on household_budgets;
create policy household_budgets_rw on household_budgets
  for all using (is_my_household(household_id)) with check (is_my_household(household_id));

drop policy if exists budget_ai_cache_rw on budget_ai_cache;
create policy budget_ai_cache_rw on budget_ai_cache
  for all using (is_my_household(household_id)) with check (is_my_household(household_id));

-- Supabase's default privileges only fire for tables created by the `postgres`
-- role, so grant explicitly — the same omission that broke every other table.
grant select, insert, update, delete on household_budgets, budget_ai_cache to authenticated;
