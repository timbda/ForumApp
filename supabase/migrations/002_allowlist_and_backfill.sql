-- Magnificent8Forum — Allowlist function + backfill of public.users
-- Run this entire block in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor).

-- ============================================================
-- ALLOWLIST FUNCTION
-- ============================================================
--
-- The login page needs to verify, BEFORE sending a magic link, that the entered
-- email belongs to a forum member. Unauthenticated users (the anon role) cannot
-- query public.users directly because RLS restricts SELECT to authenticated
-- users.
--
-- A SECURITY DEFINER function runs with the privileges of its owner (the role
-- that created it), bypassing the caller's RLS — so the anon role can call this
-- function to perform a single, narrow check (does this email exist in the
-- members table?) without being able to read the table itself.
--
-- SET search_path = public is a safety measure: it pins the schema lookup so a
-- malicious caller cannot trick the function into resolving "users" against a
-- schema they control.
--
-- Comparison is case-insensitive (lower() on both sides) because email
-- addresses are not case-sensitive in practice.

create or replace function public.is_email_allowed(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where lower(email) = lower(check_email)
  );
$$;

-- Allow both anon (pre-login) and authenticated callers to invoke the function.
grant execute on function public.is_email_allowed(text) to anon, authenticated;

-- ============================================================
-- BACKFILL public.users FROM auth.users
-- ============================================================
--
-- Some emails may already exist in auth.users (e.g. early test signups) without
-- a matching row in public.users. The allowlist check would reject them. This
-- backfill links them by id, defaults the display name to the email's local
-- part (the bit before the @), and sets is_moderator = false.
--
-- ON CONFLICT (id) DO NOTHING makes the statement idempotent: re-running the
-- migration is a no-op for users that already have a public.users row.
--
-- After running, the moderator should manually flip is_moderator = true on
-- their own row in the Supabase Table Editor.

insert into public.users (id, email, name, is_moderator)
select
  au.id,
  au.email,
  split_part(au.email, '@', 1) as name,
  false as is_moderator
from auth.users au
where au.email is not null
on conflict (id) do nothing;
