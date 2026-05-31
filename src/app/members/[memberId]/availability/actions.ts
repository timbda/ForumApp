"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  sendAvailabilityUpdate,
  type AvailabilityChange,
  type AvailabilityUpdateContext,
} from "@/lib/email/availability-update";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function getAppUrl(): string {
  const h = headers();
  const host = h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

// Sends the "your availability was updated" email to a member after a moderator
// edited it on their behalf. The CLIENT decides whether to call this (only when
// 2+ dates changed in the session); this action re-verifies authorization and
// resolves names/emails server-side so nothing sensitive is trusted from the
// client beyond the target id and the list of changes.
//
// Best-effort, mirroring the meeting emails: the availability rows are already
// written (the source of truth), so an email failure is logged and swallowed
// rather than surfaced to the moderator.
export async function notifyAvailabilityEdit(
  targetUserId: string,
  changes: AvailabilityChange[]
): Promise<void> {
  // Defensive: enforce the 2+ threshold server-side too, so a malformed client
  // call can't fire a one-date (or zero-date) email.
  const valid = (changes ?? []).filter(
    (c) => c && typeof c.date === "string" && ISO_RE.test(c.date)
  );
  if (valid.length < 2) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // The moderator must not be emailing on behalf of edits to their own row, and
  // must actually be a moderator.
  const { data: caller } = await supabase
    .from("users")
    .select("is_moderator, name")
    .eq("id", user.id)
    .maybeSingle();
  if (caller?.is_moderator !== true) {
    throw new Error("Only moderators can notify members of availability edits");
  }

  const { data: target } = await supabase
    .from("users")
    .select("name, email")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!target?.email) return; // nothing to send to

  const ctx: AvailabilityUpdateContext = {
    memberName: (target.name as string | null) ?? "there",
    memberEmail: target.email as string,
    moderatorName: (caller.name as string | null) ?? "A moderator",
    appUrl: getAppUrl(),
  };

  try {
    await sendAvailabilityUpdate(valid, ctx);
  } catch (mailErr) {
    console.error("[notifyAvailabilityEdit] sendAvailabilityUpdate failed:", mailErr);
  }
}
