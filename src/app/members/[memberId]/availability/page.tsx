import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorFallback } from "@/components/error-fallback";
import {
  createClient,
  getUserWithRetry,
  PausedProjectError,
  TransientFetchError,
} from "@/lib/supabase/server";
import { formatLocalISO } from "@/app/calendar/dates";
import { EditAvailability } from "./edit-availability";

export default async function EditMemberAvailabilityPage({
  params,
}: {
  params: { memberId: string };
}) {
  const supabase = await createClient();
  let user;
  try {
    user = await getUserWithRetry(supabase, "edit-member-availability");
  } catch (err) {
    if (err instanceof PausedProjectError) return <ErrorFallback variant="paused" />;
    if (err instanceof TransientFetchError) return <ErrorFallback variant="transient" />;
    throw err;
  }
  if (!user) redirect("/login");

  // Server-side gate #1: only moderators may reach this view at all. Combined
  // with the RLS policy and the server-action check, a non-moderator who guesses
  // the URL gets nothing and can write nothing.
  const { data: callerProfile } = await supabase
    .from("users")
    .select("is_moderator")
    .eq("id", user.id)
    .maybeSingle();
  if (callerProfile?.is_moderator !== true) redirect("/members");

  const { memberId } = params;
  const { data: member } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) redirect("/members");

  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfWindow = new Date(today.getFullYear(), today.getMonth() + 12, 0);
  const startISO = formatLocalISO(startOfMonth);
  const endISO = formatLocalISO(endOfWindow);

  const [availRes, meetingsRes] = await Promise.all([
    supabase
      .from("availability")
      .select("date")
      .eq("user_id", memberId)
      .gte("date", startISO)
      .lte("date", endISO),
    supabase
      .from("meetings")
      .select("date")
      .gte("date", startISO)
      .lte("date", endISO),
  ]);

  const availableDates = (availRes.data ?? []).map((r) => r.date as string);
  const finalizedDates = (meetingsRes.data ?? []).map((r) => r.date as string);

  return (
    <AppShell>
      <EditAvailability
        memberId={member.id as string}
        memberName={(member.name as string | null) ?? "(unnamed)"}
        availableDates={availableDates}
        finalizedDates={finalizedDates}
      />
    </AppShell>
  );
}
