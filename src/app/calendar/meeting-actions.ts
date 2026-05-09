"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function isMonThu(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow >= 1 && dow <= 4;
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

export async function finalizeMeeting(date: string): Promise<void> {
  if (!ISO_RE.test(date) || !isMonThu(date)) {
    throw new Error("Invalid date");
  }
  const { supabase, user } = await getModeratorOrThrow();
  const { error } = await supabase
    .from("meetings")
    .upsert({ date, finalized_by: user.id }, { onConflict: "date" });
  if (error) throw error;
  revalidatePath("/calendar");
}

export async function unfinalizeMeeting(date: string): Promise<void> {
  if (!ISO_RE.test(date) || !isMonThu(date)) {
    throw new Error("Invalid date");
  }
  const { supabase } = await getModeratorOrThrow();
  const { error } = await supabase.from("meetings").delete().eq("date", date);
  if (error) throw error;
  revalidatePath("/calendar");
}
