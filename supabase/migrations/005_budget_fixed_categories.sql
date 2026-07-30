-- ============================================================================
-- Manually-fixed budget categories.
--
-- Run this against an existing DINX project. Safe to re-run.
-- (It is also folded into supabase/schema.sql for fresh installs.)
--
-- Lets a category be marked as a known fixed/recurring cost directly from
-- the Budget page, the same as one backed by a Planned expense: its cap is
-- treated as exact, never recalculated from history, and the AI is told
-- never to suggest changing it.
-- ============================================================================

alter table categories
  add column if not exists budget_fixed boolean not null default false;
