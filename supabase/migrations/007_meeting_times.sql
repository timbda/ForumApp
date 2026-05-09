-- Magnificent8Forum — Customizable meeting times
-- Run this entire block in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor).
--
-- The product spec defaults forum meetings to 4:00pm–8:00pm Bermuda time, but the
-- moderator now picks specific times when finalizing each meeting. We store
-- start_time and end_time as `time` columns (no date component) since the date
-- already lives on the row. Existing rows backfill to the historical defaults
-- via the column DEFAULTs, so this migration is safe to run on a populated
-- table.
--
-- The CHECK constraint enforces a positive-length meeting at the database
-- layer, in addition to whatever validation the app does, so a bad UPSERT can
-- never produce an inverted time range.

alter table public.meetings
  add column start_time time not null default '16:00:00',
  add column end_time   time not null default '20:00:00';

alter table public.meetings
  add constraint meetings_time_range_chk check (end_time > start_time);
