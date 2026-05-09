# Magnificent8Forum — Product Spec

## Overview

Web app for the YPO Bermuda Forum (8 members) to coordinate meeting scheduling. Members access it from their phones as a home-screen shortcut.

Built in two stages:
- **Stage 1 (this spec):** Annual availability matrix + group meeting scheduling.
- **Stage 2 (future, do not build yet):** One-on-one "stir-fry" coffee/lunch meeting tracking between members.

## Working Agreement With Claude Code

- This file (`CLAUDE.md`) is the source of truth. Re-read it at the start of every session.
- Stay within the scope of **Stage 1** unless explicitly told to work on Stage 2.
- Build in small, reviewable steps. After each step, summarize what changed and stop for review.
- Never refactor unrelated code as a side-effect of a feature change.
- Prefer boring, well-known patterns over cleverness. The user is new to coding.
- Mobile-first, always. Test mobile viewports.
- No mock or placeholder data committed unless explicitly requested.

## Users and Roles

- **8 forum members.** Can: view availability of all members, mark their own availability, see finalized meeting dates.
- **Moderator (1 member).** Everything members can do, plus: pick and finalize meeting dates, manage the member list (add/remove by email), transfer the moderator role to another member.

The moderator role is a boolean flag on a user, not hardcoded. It must be transferable to another member.

## Authentication

- Magic-link login via email (Supabase Auth).
- Only emails on the approved member list can sign in. Anyone else is rejected at the login step.
- The moderator manages the member list.

### Onboarding new members

The moderator adds members from inside the app (no more manual rows in the Supabase Table Editor):

1. On `/members`, the moderator clicks **Add member** (top-right of the page).
2. Fills in the new member's email + name, optionally toggles "Make moderator", submits.
3. The `inviteMember` server action (`src/app/members/actions.ts`) verifies the caller is a moderator, then calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '<origin>/auth/callback?next=/' })` via the service-role admin client. Supabase creates the `auth.users` row and sends the invite email through the configured SMTP (Resend).
4. The action also INSERTs a matching row into `public.users` so the allowlist check (`is_email_allowed` from migration 002) lets the new member sign in.
5. The new member receives the email, clicks the link, lands on `/auth/callback`, gets a session, and is redirected to the home page. From there they can mark availability and view other members.

If the `public.users` insert fails after the auth row is created, we log it and return success — the auth row still exists, but the member won't pass the allowlist check until the row is added (manually via Table Editor, or by re-running the invite which will fail with "already a member" — in that case, fix the `public.users` row by hand).

## Core Concepts

### Forum Meetings
- Held roughly every 6 weeks year-round (~8–9 per year).
- Always 4:00pm – 8:00pm, Bermuda time.
- Always in person in Bermuda. Optional `location` field per meeting (free text, can be blank).
- Only ever scheduled on Monday, Tuesday, Wednesday, or Thursday — never Fri/Sat/Sun.

### Availability
- Each member has an availability state for every Mon–Thu in a rolling 12-month window from today.
- **Default state for every Mon–Thu is "unavailable."**
- Members mark dates "available" by tapping. Tapping again reverts to unavailable.
- Members can update their availability at any time.
- All members can view every other member's availability.

### Finalized Meetings
- The moderator picks dates from the group heatmap and marks them "finalized."
- A finalized date is locked and clearly highlighted for everyone.
- The moderator can un-finalize a date (e.g., to reschedule); it returns to being a normal date.
- Finalizing or un-finalizing a date sends an email to all 8 members.

## Screens

### Login
- Email input + "Send me a login link" button.
- Clear error if the email isn't on the member list.

### Home / Dashboard
- "Next meeting" card at the top — date, location if set, days until, time (4–8pm).
- List of next 3 finalized meetings.
- Quick link to "Edit my availability."
- Bottom navigation: Home · Calendar · Members. Plus "Admin" if the user is moderator.

### Calendar / Availability
- 12-month rolling view, Mon–Thu only (Fri/Sat/Sun hidden or greyed out).
- Two view modes the user can toggle between:
  - **My availability:** shows my own state. Tap a date to toggle available/unavailable.
  - **Group:** heatmap colored by how many members are available that day. Finalized meetings clearly highlighted.
- The next finalized meeting is always visually emphasized.

### Members
- List of all 8 members with name and role.
- Tap a member to see their availability overlaid on the calendar (read-only view).

### Admin (moderator only)
- Add/remove members by email address.
- Transfer the moderator role to another member.
- Pick meeting dates: tap a date in the heatmap to finalize. Tap a finalized date to un-finalize.
- View log of email notifications sent.

## Data Model

```sql
users (
  id uuid primary key,            -- from Supabase auth.users
  email text unique not null,
  name text not null,
  is_moderator boolean not null default false,
  created_at timestamptz not null default now()
)

availability (
  user_id uuid references users(id) on delete cascade,
  date date not null,             -- must be Mon-Thu
  -- Only "available" rows are stored. Absence of a row = unavailable (default).
  primary key (user_id, date)
)

meetings (
  id uuid primary key default gen_random_uuid(),
  date date unique not null,      -- must be Mon-Thu
  location text,
  notes text,
  finalized_by uuid references users(id),
  finalized_at timestamptz not null default now()
)
```

Stage 2 will add a `one_on_one_meetings` table later. Don't build it now, but don't paint the schema into a corner that would make it hard to add.

## Email Notifications

**When a meeting is finalized**, email all 8 members:
- Subject: `Forum meeting confirmed: [Day, Date]`
- Body: date, time (4–8pm), location (if set), link back to the app.
- Attach a `.ics` calendar invite (timezone `Atlantic/Bermuda`) so members can add it to their calendar with one tap.

**When a meeting is un-finalized**, email all 8 members:
- Subject: `Forum meeting cancelled: [Day, Date]`
- Body: brief explanation provided by the moderator.

Email provider: **Resend** (free tier handles this volume easily).

## Time Zone

- All dates are Bermuda local dates.
- Calendar invites use the `Atlantic/Bermuda` timezone identifier.
- The app does not need to support other timezones.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS.
- **Backend:** Next.js server actions / API routes.
- **Database and Auth:** Supabase.
- **Email:** Resend.
- **Hosting:** Vercel (auto-deploy from GitHub `main` branch).

## Design Principles

- **Mobile-first.** Members will mostly open this on their phones. Test mobile viewports.
- **Boring is good.** Plain Tailwind, no animations, big tap targets, clarity over cleverness.
- **Fast.** Heatmap and availability views must feel instant.
- **Nothing confidential.** The most sensitive data stored is members' email addresses.
