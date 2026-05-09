"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function isMonThu(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow >= 1 && dow <= 4;
}

async function getUserOrThrow() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function markUnavailable(date: string): Promise<void> {
  if (!ISO_RE.test(date) || !isMonThu(date)) {
    throw new Error("Invalid date");
  }
  const { supabase, user } = await getUserOrThrow();
  const { error } = await supabase
    .from("availability")
    .upsert({ user_id: user.id, date }, { onConflict: "user_id,date" });
  if (error) throw error;
  revalidatePath("/calendar");
}

export async function markAvailable(date: string): Promise<void> {
  if (!ISO_RE.test(date) || !isMonThu(date)) {
    throw new Error("Invalid date");
  }
  const { supabase, user } = await getUserOrThrow();
  const { error } = await supabase
    .from("availability")
    .delete()
    .eq("user_id", user.id)
    .eq("date", date);
  if (error) throw error;
  revalidatePath("/calendar");
}
