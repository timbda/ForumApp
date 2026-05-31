// Notification email sent to a member when a moderator edits their availability
// on their behalf (2 or more dates changed in a single editing session — see
// src/app/members/[memberId]/availability/actions.ts for the threshold logic).
//
// Unlike meeting invites, this email carries no .ics attachment — it's a plain
// heads-up that someone changed your availability, with a link to review it.

import { Resend } from "resend";

const FROM_ADDRESS = "Magnificent8Forum <noreply@mail.virtuallegacy.ai>";

export type AvailabilityChange = {
  date: string; // YYYY-MM-DD
  available: boolean; // the NEW state after the moderator's edit
};

export type AvailabilityUpdateContext = {
  memberName: string;
  memberEmail: string;
  moderatorName: string;
  appUrl: string;
};

let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY is not set");
    }
    resendClient = new Resend(key);
  }
  return resendClient;
}

export async function sendAvailabilityUpdate(
  changes: AvailabilityChange[],
  ctx: AvailabilityUpdateContext
): Promise<void> {
  if (!ctx.memberEmail) return;
  if (changes.length === 0) return;

  const resend = getResend();
  const subject = "Your forum availability was updated";
  const { html, text } = renderBody(changes, ctx);

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [ctx.memberEmail],
    subject,
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

function renderBody(
  changes: AvailabilityChange[],
  ctx: AvailabilityUpdateContext
): { html: string; text: string } {
  const calendarUrl = `${ctx.appUrl}/calendar`;
  // Sort chronologically so the list reads naturally.
  const sorted = [...changes].sort((a, b) => a.date.localeCompare(b.date));

  const lines = sorted.map(
    (c) => `${formatLongDate(c.date)} — ${c.available ? "Available" : "Not available"}`
  );

  const text = [
    `Hi ${ctx.memberName},`,
    "",
    `${ctx.moderatorName} updated your forum availability on your behalf. The following dates changed:`,
    "",
    ...lines,
    "",
    `If anything looks wrong, you can review and change it yourself here: ${calendarUrl}`,
  ].join("\n");

  const listHtml = sorted
    .map(
      (c) =>
        `<li style="margin:0 0 4px;"><strong>${escapeHtml(formatLongDate(c.date))}</strong> — ${
          c.available ? "Available" : "Not available"
        }</li>`
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h1 style="font-size:20px;margin:0 0 12px;">Your forum availability was updated</h1>
      <p style="margin:0 0 12px;">Hi ${escapeHtml(ctx.memberName)},</p>
      <p style="margin:0 0 12px;color:#475569;">${escapeHtml(ctx.moderatorName)} updated your forum availability on your behalf. The following dates changed:</p>
      <ul style="margin:0 0 16px;padding-left:20px;">${listHtml}</ul>
      <p style="margin:16px 0 0;">If anything looks wrong, you can <a href="${escapeAttr(calendarUrl)}" style="color:#1d4ed8;">review and change it yourself</a>.</p>
    </div>
  `;
  return { html, text };
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
