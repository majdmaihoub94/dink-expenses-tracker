-- ============================================================================
-- Per-household defaults for the "shared cost" toggle on new expenses.
--
-- Run this against an existing DINX project. Safe to re-run.
-- (It is also folded into supabase/schema.sql for fresh installs.)
-- ============================================================================

alter table households
  add column if not exists default_expense_shared boolean not null default false,
  add column if not exists default_split_percent smallint not null default 50
    check (default_split_percent between 0 and 100);
