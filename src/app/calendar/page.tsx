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

  const { data: rows } = await supabase
    .from("availability")
    .select("date")
    .eq("user_id", user.id)
    .gte("date", formatLocalISO(startOfMonth))
    .lte("date", formatLocalISO(endOfWindow));

  const unavailableDates = (rows ?? []).map((r) => r.date as string);

  return <Calendar unavailableDates={unavailableDates} />;
}
