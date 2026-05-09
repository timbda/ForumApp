-- Magnificent8Forum — Invert availability semantics
-- Run this entire block in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor).
--
-- OLD semantics: a row in public.availability meant the member was UNAVAILABLE on that date.
--                Absence of a row = available (default).
-- NEW semantics: a row in public.availability means the member is AVAILABLE on that date.
--                Absence of a row = unavailable (default).
--
-- We discovered the old default was wrong for this group's workflow: most members are
-- usually unavailable on any given Mon-Thu, so making them tap to "opt in" to a date is
-- the cheaper UX path.

-- ============================================================
-- 1. Drop deprecated is_available column if it ever existed.
-- ============================================================
-- A previous iteration may have added a boolean. Under the new semantics, the row's mere
-- existence carries the meaning; no extra boolean is needed. IF EXISTS makes this a no-op
-- when the column was never added.

alter table public.availability drop column if exists is_available;

-- ============================================================
-- 2. Wipe existing rows.
-- ============================================================
-- Existing rows mean "unavailable" under the old convention; under the new convention they
-- would mean "available," which is the opposite of what their authors intended. Translating
-- by inverting the entire forum's saved state is more dangerous than starting fresh — and
-- this is still test data, so we wipe.

truncate table public.availability;

-- ============================================================
-- 3. Document the new semantics on the table itself.
-- ============================================================
-- A table comment is queryable from psql (\d+) and visible in the Supabase dashboard, so
-- future readers don't have to dig through migrations to understand what a row means.

comment on table public.availability is
  'Rows in this table mean the member is AVAILABLE on that date. Absence of a row = unavailable (default). Only Mon-Thu dates are valid (enforced at the application layer).';
