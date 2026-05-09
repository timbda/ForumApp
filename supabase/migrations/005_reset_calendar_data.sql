-- Magnificent8Forum — Moderator reset of calendar data
-- Run this entire block in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor).
--
-- Provides a single function the /members "Danger zone" can call to wipe calendar
-- state without touching user accounts. Useful for end-of-year resets and for
-- clearing test data during development.
--
-- We use SECURITY DEFINER + a moderator check inside the function for two reasons:
--   1. ATOMICITY. A plpgsql function body runs in one implicit transaction, so all
--      three statements (delete availability, delete meetings, null out
--      last_reviewed_at) succeed or roll back together. Doing this from the
--      app-side client would require three separate round trips with no rollback.
--   2. PARITY WITH EXISTING PATTERNS. Migration 002 already uses SECURITY DEFINER
--      (is_email_allowed) for a similar reason — bypass RLS for a narrow,
--      function-internal check. We apply the same shape here.
--
-- The function bypasses RLS *because* of SECURITY DEFINER, so we explicitly verify
-- the caller is a moderator before doing anything. Without that check, any
-- authenticated user could call the RPC and wipe the table.

create or replace function public.reset_calendar_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and is_moderator = true
  ) then
    raise exception 'Only moderators can reset calendar data';
  end if;

  delete from public.availability;
  delete from public.meetings;
  update public.users set last_reviewed_at = null;
end;
$$;

-- Authenticated callers may invoke the function; the moderator check inside
-- prevents non-moderators from completing it.
grant execute on function public.reset_calendar_data() to authenticated;
