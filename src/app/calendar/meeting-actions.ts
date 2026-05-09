"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  sendMeetingInvite,
  sendMeetingCancellation,
  type Attendee,
  type EmailContext,
  type MeetingPayload,
} from "@/lib/email/meeting-invite";

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
    .select("is_moderator, name, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_moderator) throw new Error("Not a moderator");
  return { supabase, user, profile };
}

function getAppUrl(): string {
  const h = headers();
  const host = h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

async function fetchAttendees(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Attendee[]> {
  const { data, error } = await supabase
    .from("users")
    .select("name, email")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((u) => ({
    name: (u.name as string | null) ?? "",
    email: (u.email as string | null) ?? "",
  })).filter((a) => a.email);
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

  const { supabase, user, profile } = await getModeratorOrThrow();
  const { data: upserted, error } = await supabase
    .from("meetings")
    .upsert(
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
    )
    .select("id, date, start_time, end_time, location, notes")
    .single();
  if (error) throw error;
  revalidatePath("/calendar");

  // Best-effort notification. The DB write is the source of truth, so we never
  // surface email errors to the moderator — the meeting is finalized either
  // way. We log loudly so misconfiguration shows up in server logs.
  try {
    const attendees = await fetchAttendees(supabase);
    const meetingPayload: MeetingPayload = {
      id: upserted.id as string,
      date: upserted.date as string,
      startTime: upserted.start_time as string,
      endTime: upserted.end_time as string,
      location: (upserted.location as string | null) ?? null,
      notes: (upserted.notes as string | null) ?? null,
    };
    const ctx: EmailContext = {
      organizerName: (profile.name as string | null) ?? "Forum moderator",
      organizerEmail:
        (profile.email as string | null) ?? user.email ?? FROM_FALLBACK_EMAIL,
      appUrl: getAppUrl(),
    };
    await sendMeetingInvite(meetingPayload, attendees, ctx);
  } catch (mailErr) {
    console.error("[finalizeMeeting] sendMeetingInvite failed:", mailErr);
  }
}

export async function unfinalizeMeeting(
  date: string,
  reason?: string | null
): Promise<void> {
  if (!ISO_RE.test(date) || !isMonThu(date)) {
    throw new Error("Invalid date");
  }
  const { supabase, user, profile } = await getModeratorOrThrow();

  // Pull the meeting row before deleting so we have the id (for a stable .ics
  // UID that matches the original invite) and the times/location to render in
  // the cancellation email.
  const { data: existing } = await supabase
    .from("meetings")
    .select("id, date, start_time, end_time, location, notes")
    .eq("date", date)
    .maybeSingle();

  const { error } = await supabase.from("meetings").delete().eq("date", date);
  if (error) throw error;
  revalidatePath("/calendar");

  if (!existing) return;

  const trimmedReason = reason?.trim() || null;
  try {
    const attendees = await fetchAttendees(supabase);
    const meetingPayload: MeetingPayload = {
      id: existing.id as string,
      date: existing.date as string,
      startTime: existing.start_time as string,
      endTime: existing.end_time as string,
      location: (existing.location as string | null) ?? null,
      notes: (existing.notes as string | null) ?? null,
    };
    const ctx: EmailContext = {
      organizerName: (profile.name as string | null) ?? "Forum moderator",
      organizerEmail:
        (profile.email as string | null) ?? user.email ?? FROM_FALLBACK_EMAIL,
      appUrl: getAppUrl(),
    };
    await sendMeetingCancellation(meetingPayload, attendees, trimmedReason, ctx);
  } catch (mailErr) {
    console.error(
      "[unfinalizeMeeting] sendMeetingCancellation failed:",
      mailErr
    );
  }
}

// Used as a last-resort organizer email. The moderator's profile email is the
// expected source; this only fires if both `profile.email` and the auth
// `user.email` are unexpectedly missing.
const FROM_FALLBACK_EMAIL = "noreply@mail.virtuallegacy.ai";
