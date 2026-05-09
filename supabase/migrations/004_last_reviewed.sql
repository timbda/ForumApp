-- Magnificent8Forum — Track when each member last reviewed their availability
-- Run this entire block in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor).

-- ============================================================
-- ADD last_reviewed_at TO public.users
-- ============================================================
-- We want to surface "who has actually looked at the calendar lately?" in two places:
--   1. The /members page, as a per-member status line.
--   2. The Group availability view, as an at-a-glance "X of Y reviewed in the last 30 days"
--      banner so the moderator knows whether the heatmap is reflecting current intentions.
--
-- The column is nullable: a NULL value means the user has never opened /calendar since
-- this column was added. We don't backfill — that would manufacture false history.
--
-- The timestamp is set by the calendar page on every server-side render, fire-and-forget,
-- via a small server action. Updating-on-render is intentionally crude — it captures
-- "did this person look at the calendar?" without requiring an explicit "reviewed" button.

alter table public.users
  add column last_reviewed_at timestamptz;

comment on column public.users.last_reviewed_at is
  'Timestamp of the most recent time this user opened /calendar. NULL means they have never opened it since the column was added. Updated on every server-side render of the calendar page (fire-and-forget).';
