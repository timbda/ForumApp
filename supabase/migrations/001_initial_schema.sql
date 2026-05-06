-- Magnificent8Forum — Initial Schema
-- Run this entire block in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor).

-- ============================================================
-- TABLES
-- ============================================================

-- Forum members. The id comes from Supabase auth.users.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  is_moderator boolean not null default false,
  created_at timestamptz not null default now()
);

-- Availability: only "unavailable" dates are stored.
-- If a (user_id, date) row does NOT exist, that member is available.
create table public.availability (
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  primary key (user_id, date)
);

-- Finalized meetings. One row per confirmed meeting date.
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  date date unique not null,
  location text,
  notes text,
  finalized_by uuid references public.users(id),
  finalized_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users enable row level security;
alter table public.availability enable row level security;
alter table public.meetings enable row level security;

-- ---- users ----

-- Any logged-in member can see the full member list.
create policy "Users are viewable by authenticated users"
  on public.users for select
  to authenticated
  using (true);

-- Only moderators can add new members.
create policy "Moderators can insert users"
  on public.users for insert
  to authenticated
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_moderator = true
    )
  );

-- Users can update their own row; moderators can update any row.
create policy "Users can update own row, moderators can update any"
  on public.users for update
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.users
      where id = auth.uid() and is_moderator = true
    )
  )
  with check (
    id = auth.uid()
    or exists (
      select 1 from public.users
      where id = auth.uid() and is_moderator = true
    )
  );

-- Only moderators can remove members.
create policy "Moderators can delete users"
  on public.users for delete
  to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_moderator = true
    )
  );

-- ---- availability ----

-- Any logged-in member can see everyone's availability.
create policy "Availability is viewable by authenticated users"
  on public.availability for select
  to authenticated
  using (true);

-- Members can mark their own dates unavailable.
create policy "Users can insert own availability"
  on public.availability for insert
  to authenticated
  with check (user_id = auth.uid());

-- Members can update their own availability rows.
create policy "Users can update own availability"
  on public.availability for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Members can delete their own unavailability (revert to available).
create policy "Users can delete own availability"
  on public.availability for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- meetings ----

-- Any logged-in member can see finalized meetings.
create policy "Meetings are viewable by authenticated users"
  on public.meetings for select
  to authenticated
  using (true);

-- Only moderators can finalize a meeting.
create policy "Moderators can insert meetings"
  on public.meetings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_moderator = true
    )
  );

-- Only moderators can update meeting details (location, notes, etc.).
create policy "Moderators can update meetings"
  on public.meetings for update
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

-- Only moderators can un-finalize (delete) a meeting.
create policy "Moderators can delete meetings"
  on public.meetings for delete
  to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_moderator = true
    )
  );

-- ============================================================
-- INDEXES (for performance on the calendar/heatmap queries)
-- ============================================================

-- Fast lookup of all unavailable dates for a given user.
create index idx_availability_user on public.availability (user_id);

-- Fast lookup of all members unavailable on a given date (heatmap).
create index idx_availability_date on public.availability (date);

-- Upcoming meetings sorted by date.
create index idx_meetings_date on public.meetings (date);
