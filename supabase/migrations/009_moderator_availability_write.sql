-- Magnificent8Forum — Moderators can write availability on behalf of any member.
-- Run this entire block in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- AFTER taking a backup.
--
-- PURELY ADDITIVE. This does NOT touch the existing four availability policies
-- (select / insert-own / update-own / delete-own). Postgres OR's permissive
-- policies together, so adding this one only WIDENS who may write — every
-- member's self-edit keeps working exactly as before.
--
-- A single FOR ALL policy is used so a moderator can:
--   * INSERT a row  -> mark a member AVAILABLE on a date
--   * DELETE a row  -> mark a member NOT AVAILABLE (the app deletes the row)
--   * UPDATE a row  -> the upsert's ON CONFLICT path
-- FOR ALL also covers SELECT, but availability already has a permissive
-- "viewable by authenticated users" SELECT policy, so this adds nothing
-- restrictive there.
--
-- The moderator check is the same subquery already used by the meetings and
-- users policies in migration 001, so there is no recursion risk (the users
-- SELECT policy is `using (true)`).

create policy "Moderators can write any availability"
  on public.availability
  for all
  to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_moderator = true
    )
  )
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_moderator = true
    )
  );
