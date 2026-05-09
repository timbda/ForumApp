import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Calendar } from "./calendar";
import { formatLocalISO } from "./dates";

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
    membersCountRes,
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
    supabase.from("users").select("*", { count: "exact", head: true }),
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
  const totalMembers = membersCountRes.count ?? 0;
  const isModerator = profileRes.data?.is_moderator === true;

  return (
    <Calendar
      availableDates={availableDates}
      availabilityCounts={availabilityCounts}
      finalizedDates={finalizedDates}
      totalMembers={totalMembers}
      isModerator={isModerator}
    />
  );
}
