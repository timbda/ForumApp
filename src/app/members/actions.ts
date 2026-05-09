"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

export async function updateMemberName(
  userId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");

  const { supabase } = await getModeratorOrThrow();
  const { error } = await supabase
    .from("users")
    .update({ name: trimmed })
    .eq("id", userId);
  if (error) throw error;
  revalidatePath("/members");
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
