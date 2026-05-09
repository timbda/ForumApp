import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateLastReviewed } from "@/lib/server-actions/update-last-reviewed";
import { Calendar } from "./calendar";
import { formatLocalISO } from "./dates";

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
      .select("date")
      .gte("date", startISO)
      .lte("date", endISO),
    supabase.from("users").select("last_reviewed_at"),
    supabase
      .from("users")
      .select("is_moderator")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const allAvail = allAvailRes.data ?? [];

  const availableDates = allAvail
    .filter((r) => r.user_id === user.id)
    .map((r) => r.date as string);

  const availabilityCounts: Record<string, number> = {};
  for (const row of allAvail) {
    const d = row.date as string;
    availabilityCounts[d] = (availabilityCounts[d] ?? 0) + 1;
  }

  const finalizedDates = (meetingsRes.data ?? []).map((m) => m.date as string);
  const allUsers = allUsersRes.data ?? [];
  const totalMembers = allUsers.length;
  const isModerator = profileRes.data?.is_moderator === true;

  // Members "reviewed recently" = last_reviewed_at within the past 30 days.
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const reviewedRecentlyCount = allUsers.filter(
    (u) =>
      u.last_reviewed_at !== null &&
      new Date(u.last_reviewed_at as string).getTime() >= thirtyDaysAgoMs
  ).length;

  return (
    <Calendar
      availableDates={availableDates}
      availabilityCounts={availabilityCounts}
      finalizedDates={finalizedDates}
      totalMembers={totalMembers}
      isModerator={isModerator}
      reviewedRecentlyCount={reviewedRecentlyCount}
    />
  );
}
