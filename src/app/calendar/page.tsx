import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorFallback } from "@/components/error-fallback";
import {
  createClient,
  getUserWithRetry,
  PausedProjectError,
  TransientFetchError,
} from "@/lib/supabase/server";
import { updateLastReviewed } from "@/lib/server-actions/update-last-reviewed";
import { Calendar } from "./calendar";
import { formatLocalISO } from "./dates";

export default async function CalendarPage() {
  const supabase = await createClient();
  let user;
  try {
    user = await getUserWithRetry(supabase, "calendar");
  } catch (err) {
    if (err instanceof PausedProjectError) return <ErrorFallback variant="paused" />;
    if (err instanceof TransientFetchError) return <ErrorFallback variant="transient" />;
    throw err;
  }
  if (!user) redirect("/login");

  // Fire-and-forget: don't block the calendar render on the timestamp update.
  // Errors are logged so unhandled promise rejections don't surface in dev.
  updateLastReviewed().catch((err) =>
    console.error("[updateLastReviewed]", err)
  );

  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfWindow = new Date(
    today.getFullYear(),
    today.getMonth() + 12,
    0
  );
  const startISO = formatLocalISO(startOfMonth);
  const endISO = formatLocalISO(endOfWindow);

  const [
    allAvailRes,
    meetingsRes,
    allUsersRes,
    profileRes,
  ] = await Promise.all([
    supabase
      .from("availability")
      .select("user_id, date")
      .gte("date", startISO)
      .lte("date", endISO),
    supabase
      .from("meetings")
      .select("date, start_time, end_time, location")
      .gte("date", startISO)
      .lte("date", endISO),
    supabase
      .from("users")
      .select("id, name, last_reviewed_at")
      .order("name"),
    supabase
      .from("users")
      .select("is_moderator")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const allAvail = allAvailRes.data ?? [];
  const allUsers = allUsersRes.data ?? [];

  const availableDates = allAvail
    .filter((r) => r.user_id === user.id)
    .map((r) => r.date as string);

  const availabilityCounts: Record<string, number> = {};
  for (const row of allAvail) {
    const d = row.date as string;
    availabilityCounts[d] = (availabilityCounts[d] ?? 0) + 1;
  }

  // Per-date list of available member names (sorted) — feeds the group-cell
  // popover. Builds against the user list so unknown user_ids are skipped.
  const nameById = new Map<string, string>(
    allUsers.map((u) => [
      u.id as string,
      (u.name as string | null) ?? "(unnamed)",
    ])
  );
  const availabilityByDate: Record<string, string[]> = {};
  for (const row of allAvail) {
    const name = nameById.get(row.user_id as string);
    if (!name) continue;
    const d = row.date as string;
    (availabilityByDate[d] ??= []).push(name);
  }
  for (const d of Object.keys(availabilityByDate)) {
    availabilityByDate[d].sort((a, b) => a.localeCompare(b));
  }

  // Sort ascending so the Upcoming Meetings card renders chronologically
  // without re-sorting on the client.
  const meetings = (meetingsRes.data ?? [])
    .map((m) => ({
      date: m.date as string,
      startTime: (m.start_time as string | null) ?? "16:00:00",
      endTime: (m.end_time as string | null) ?? "20:00:00",
      location: (m.location as string | null) ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalMembers = allUsers.length;
  const isModerator = profileRes.data?.is_moderator === true;

  // Members "reviewed recently" = last_reviewed_at within the past 30 days.
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const reviewedRecentlyCount = allUsers.filter(
    (u) =>
      u.last_reviewed_at !== null &&
      new Date(u.last_reviewed_at as string).getTime() >= thirtyDaysAgoMs
  ).length;

  const memberStatuses = allUsers.map((u) => ({
    name: (u.name as string | null) ?? "(unnamed)",
    last_reviewed_at: (u.last_reviewed_at as string | null) ?? null,
  }));

  return (
    <AppShell>
      <Calendar
        availableDates={availableDates}
        availabilityCounts={availabilityCounts}
        availabilityByDate={availabilityByDate}
        meetings={meetings}
        totalMembers={totalMembers}
        isModerator={isModerator}
        reviewedRecentlyCount={reviewedRecentlyCount}
        memberStatuses={memberStatuses}
      />
    </AppShell>
  );
}
