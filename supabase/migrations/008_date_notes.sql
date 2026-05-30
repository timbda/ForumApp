-- Magnificent8Forum — Date notes
-- Run this entire block in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor).
--
-- Adds a date_notes table for informational notes that any member can attach
-- to any date. Notes are purely informational — they do NOT affect availability,
-- meeting scheduling, the heatmap, or any existing logic. Examples: "Christmas
-- Day", "My birthday", "Conference in NYC".
--
-- This migration is PURELY ADDITIVE. It does not modify any existing tables,
-- columns, policies, indexes, or functions.

-- ============================================================
-- TABLE
-- ============================================================

create table public.date_notes (
  id uuid primary key default gen_random_uuid(),
  note_date date not null,
  author_id uuid not null references public.users(id) on delete cascade,
  note_text varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One note per (date, author). A member who wants to change their note
  -- updates the existing row rather than stacking a second one.
  unique (note_date, author_id),
  constraint date_notes_text_not_blank check (length(btrim(note_text)) > 0)
);

create index idx_date_notes_date on public.date_notes (note_date);
create index idx_date_notes_author on public.date_notes (author_id);

-- ============================================================
-- updated_at TRIGGER
-- ============================================================

create or replace function public.date_notes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger date_notes_set_updated_at
  before update on public.date_notes
  for each row execute function public.date_notes_set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.date_notes enable row level security;

-- All forum members can read all notes.
create policy "Date notes are viewable by authenticated users"
  on public.date_notes for select
  to authenticated
  using (true);

-- Members can insert only their own notes.
create policy "Users can insert own date notes"
  on public.date_notes for insert
  to authenticated
  with check (author_id = auth.uid());

-- Members can update only their own notes.
create policy "Users can update own date notes"
  on public.date_notes for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Members can delete only their own notes.
create policy "Users can delete own date notes"
  on public.date_notes for delete
  to authenticated
  using (author_id = auth.uid());
