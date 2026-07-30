-- ============================================================================
-- Credit card limits — lets Budget reason about a card as a revolving limit
-- rather than a normal expense category.
--
-- Run this against an existing DINX project. Safe to re-run.
-- (It is also folded into supabase/schema.sql for fresh installs.)
-- ============================================================================

alter table payment_methods
  add column if not exists credit_limit numeric(12, 2) check (credit_limit is null or credit_limit >= 0);
