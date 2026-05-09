"use server";

import { createClient } from "@/lib/supabase/server";

// Sets public.users.last_reviewed_at = now() for the currently authenticated user.
// Called fire-and-forget from /calendar so the page render is never blocked on it.
// Silent failure is acceptable here: missing a single timestamp update is far less
// disruptive than delaying the calendar render. The next visit corrects it.
export async function updateLastReviewed(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("users")
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq("id", user.id);
}
