"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function isMonThu(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow >= 1 && dow <= 4;
}

// Resolves which user_id the write should target.
//   - No targetUserId (or it equals the caller): a normal self-edit.
//   - A different targetUserId: only allowed if the caller is a moderator.
//
// This is defense-in-depth on top of RLS. The "Moderators can write any
// availability" policy (migration 009) is the real gatekeeper at the database
// level; this check rejects unauthorized callers earlier with a clear error.
async function resolveWriteTarget(targetUserId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const writeFor = targetUserId ?? user.id;
  if (writeFor !== user.id) {
    const { data: profile } = await supabase
      .from("users")
      .select("is_moderator")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.is_moderator !== true) {
      throw new Error("Only moderators can edit another member's availability");
    }
  }
  return { supabase, writeFor };
}

// A row in public.availability means the member is AVAILABLE on that date.
// Absence of a row = unavailable (default).
//
// `targetUserId` is optional: omit it for a self-edit (the default), or pass a
// member's id to edit on their behalf (moderators only — see resolveWriteTarget).

export async function markAvailable(
  date: string,
  targetUserId?: string
): Promise<void> {
  if (!ISO_RE.test(date) || !isMonThu(date)) {
    throw new Error("Invalid date");
  }
  const { supabase, writeFor } = await resolveWriteTarget(targetUserId);
  const { error } = await supabase
    .from("availability")
    .upsert({ user_id: writeFor, date }, { onConflict: "user_id,date" });
  if (error) throw error;
  revalidatePath("/calendar");
}

export async function markUnavailable(
  date: string,
  targetUserId?: string
): Promise<void> {
  if (!ISO_RE.test(date) || !isMonThu(date)) {
    throw new Error("Invalid date");
  }
  const { supabase, writeFor } = await resolveWriteTarget(targetUserId);
  const { error } = await supabase
    .from("availability")
    .delete()
    .eq("user_id", writeFor)
    .eq("date", date);
  if (error) throw error;
  revalidatePath("/calendar");
}
