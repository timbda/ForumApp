"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LEN = 100;

async function getUserOrThrow() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function upsertDateNote(
  date: string,
  text: string
): Promise<void> {
  if (!ISO_RE.test(date)) throw new Error("Invalid date");
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error("Note can't be empty");
  if (trimmed.length > MAX_LEN) {
    throw new Error(`Note too long (max ${MAX_LEN} characters)`);
  }

  const { supabase, user } = await getUserOrThrow();
  const { error } = await supabase
    .from("date_notes")
    .upsert(
      { note_date: date, author_id: user.id, note_text: trimmed },
      { onConflict: "note_date,author_id" }
    );
  if (error) throw error;
  revalidatePath("/calendar");
}

export async function deleteDateNote(date: string): Promise<void> {
  if (!ISO_RE.test(date)) throw new Error("Invalid date");
  const { supabase, user } = await getUserOrThrow();
  const { error } = await supabase
    .from("date_notes")
    .delete()
    .eq("note_date", date)
    .eq("author_id", user.id);
  if (error) throw error;
  revalidatePath("/calendar");
}
