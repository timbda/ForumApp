-- Magnificent8Forum — Allow deleting a member who has finalized meetings
-- Run this entire block in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor).
--
-- Migration 001 declared:
--   finalized_by uuid references public.users(id)
-- without an ON DELETE clause, which defaults to NO ACTION. That means deleting
-- a user who has ever finalized a meeting fails with a foreign-key violation.
-- Now that moderators can remove members from the app (/members → Edit → Delete),
-- we need the FK to clear itself on delete instead.
--
-- The column is already nullable (no NOT NULL constraint), so SET NULL is safe.
-- Meetings keep their date and any other metadata; only the "who finalized this"
-- attribution is lost when the original moderator is removed.

alter table public.meetings
  drop constraint meetings_finalized_by_fkey;

alter table public.meetings
  add constraint meetings_finalized_by_fkey
  foreign key (finalized_by) references public.users(id) on delete set null;
