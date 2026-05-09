"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ResetResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

async function getCallerOrThrow() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("users")
    .select("is_moderator")
    .eq("id", user.id)
    .maybeSingle();
  return { supabase, user, isModerator: profile?.is_moderator === true };
}

async function getModeratorOrThrow() {
  const result = await getCallerOrThrow();
  if (!result.isModerator) throw new Error("Not a moderator");
  return result;
}

export async function updateMemberName(
  userId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");

  const { supabase, user, isModerator } = await getCallerOrThrow();
  // Members can rename themselves; moderators can rename anyone.
  if (userId !== user.id && !isModerator) {
    throw new Error("Only moderators can edit other members' names");
  }

  const { error } = await supabase
    .from("users")
    .update({ name: trimmed })
    .eq("id", userId);
  if (error) throw error;
  revalidatePath("/members");
}

export async function resetCalendarData(): Promise<ResetResult> {
  // Two clients deliberately:
  //   1. The auth-aware SSR client to verify the caller is a moderator.
  //   2. The service-role admin client to perform the destructive operations.
  //      Service role bypasses RLS, so the unfiltered DELETEs and the
  //      everyone-rows UPDATE go through.
  //
  // We catch all errors and return a tagged result so the UI never sees a raw
  // Postgres error object. On failure, callers get a single human-readable
  // message string.
  try {
    await getModeratorOrThrow();
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Authorization check failed",
    };
  }

  try {
    const admin = createAdminClient();

    // Supabase JS / PostgREST refuses unfiltered DELETE/UPDATE for safety, so
    // each statement carries a tautology: "where (NOT NULL) IS TRUE", which
    // matches every row given the schema's NOT NULL constraints.

    const { error: availErr } = await admin
      .from("availability")
      .delete()
      .not("user_id", "is", null);
    if (availErr) {
      return { ok: false, message: `Reset failed at availability: ${availErr.message}` };
    }

    const { error: meetingsErr } = await admin
      .from("meetings")
      .delete()
      .not("id", "is", null);
    if (meetingsErr) {
      return { ok: false, message: `Reset failed at meetings: ${meetingsErr.message}` };
    }

    const { error: usersErr } = await admin
      .from("users")
      .update({ last_reviewed_at: null })
      .not("id", "is", null);
    if (usersErr) {
      return { ok: false, message: `Reset failed at users: ${usersErr.message}` };
    }

    revalidatePath("/calendar");
    revalidatePath("/members");
    return { ok: true, message: "All calendar data has been reset." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function toggleMemberModerator(userId: string): Promise<void> {
  const { supabase, user } = await getModeratorOrThrow();

  // Refuse to toggle the caller's own moderator flag. Prevents the only
  // moderator from accidentally locking themselves out — they have to ask
  // another moderator (or the dashboard owner) to flip them off.
  if (userId === user.id) {
    throw new Error("Cannot toggle your own moderator flag");
  }

  const { data: target } = await supabase
    .from("users")
    .select("is_moderator")
    .eq("id", userId)
    .maybeSingle();
  if (!target) throw new Error("User not found");

  const { error } = await supabase
    .from("users")
    .update({ is_moderator: !target.is_moderator })
    .eq("id", userId);
  if (error) throw error;
  revalidatePath("/members");
}
