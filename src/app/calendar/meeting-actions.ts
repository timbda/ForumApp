"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const DEFAULT_START_TIME = "16:00";
const DEFAULT_END_TIME = "20:00";

function isMonThu(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow >= 1 && dow <= 4;
}

// "HH:MM" → minutes since midnight, for ordering checks. Returns null if the
// input doesn't match the expected shape.
function timeToMinutes(t: string): number | null {
  if (!TIME_RE.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

async function getModeratorOrThrow() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("users")
    .select("is_moderator")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_moderator) throw new Error("Not a moderator");
  return { supabase, user };
}

export type FinalizeMeetingInput = {
  date: string;
  startTime?: string; // "HH:MM" — defaults to 16:00
  endTime?: string;   // "HH:MM" — defaults to 20:00
  location?: string | null;
  notes?: string | null;
};

export async function finalizeMeeting(input: FinalizeMeetingInput): Promise<void> {
  const { date } = input;
  if (!ISO_RE.test(date) || !isMonThu(date)) {
    throw new Error("Invalid date");
  }

  const startTime = input.startTime ?? DEFAULT_START_TIME;
  const endTime = input.endTime ?? DEFAULT_END_TIME;
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  if (startMin === null || endMin === null) {
    throw new Error("Invalid time format (expected HH:MM)");
  }
  if (endMin <= startMin) {
    throw new Error("End time must be after start time");
  }

  const location = input.location?.trim() || null;
  const notes = input.notes?.trim() || null;

  const { supabase, user } = await getModeratorOrThrow();
  const { error } = await supabase.from("meetings").upsert(
    {
      date,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      location,
      notes,
      finalized_by: user.id,
      finalized_at: new Date().toISOString(),
    },
    { onConflict: "date" }
  );
  if (error) throw error;
  revalidatePath("/calendar");
}

export async function unfinalizeMeeting(
  date: string,
  _reason?: string | null
): Promise<void> {
  if (!ISO_RE.test(date) || !isMonThu(date)) {
    throw new Error("Invalid date");
  }
  const { supabase } = await getModeratorOrThrow();
  const { error } = await supabase.from("meetings").delete().eq("date", date);
  if (error) throw error;
  revalidatePath("/calendar");
}
