// Meeting invite emails for finalized/cancelled forum meetings.
//
// We use Resend for delivery and the `ics` package to generate the iCalendar
// payload. `ics` does not natively emit TZID-tagged DTSTART/DTEND values, so we
// post-process its output to attach `Atlantic/Bermuda` and prepend a
// VTIMEZONE block. Most modern clients (Gmail, Outlook, Apple Calendar)
// recognise the zone name on its own, but RFC 5545 wants the VTIMEZONE block
// for older clients, and including it costs us only a handful of lines.

import { createEvent, type EventAttributes } from "ics";
import { Resend } from "resend";

const FROM_ADDRESS = "Magnificent8Forum <noreply@mail.virtuallegacy.ai>";
const PRODUCT_ID = "-//Magnificent8Forum//Forum Meeting//EN";
const TIMEZONE_ID = "Atlantic/Bermuda";

// Bermuda observes US-style daylight saving (since 2007): start on the second
// Sunday in March, end on the first Sunday in November. This static block
// covers every plausible meeting date for the forum.
const VTIMEZONE_BLOCK = [
  "BEGIN:VTIMEZONE",
  `TZID:${TIMEZONE_ID}`,
  "BEGIN:DAYLIGHT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3",
  "TZNAME:ADT",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0300",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11",
  "TZNAME:AST",
  "TZOFFSETFROM:-0300",
  "TZOFFSETTO:-0400",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

export type MeetingPayload = {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // "HH:MM:SS" or "HH:MM"
  endTime: string;
  location: string | null;
  notes: string | null;
};

export type Attendee = {
  name: string;
  email: string;
};

export type EmailContext = {
  organizerName: string;
  organizerEmail: string;
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

export async function sendMeetingInvite(
  meeting: MeetingPayload,
  attendees: Attendee[],
  ctx: EmailContext
): Promise<void> {
  const ics = buildIcs(meeting, attendees, ctx, "REQUEST");
  const subject = `Forum meeting confirmed: ${formatDayDate(meeting.date)}`;
  const { html, text } = renderConfirmationBody(meeting, ctx);
  await send(subject, html, text, attendees, ics, "invite.ics");
}

export async function sendMeetingCancellation(
  meeting: MeetingPayload,
  attendees: Attendee[],
  reason: string | null,
  ctx: EmailContext
): Promise<void> {
  const ics = buildIcs(meeting, attendees, ctx, "CANCEL");
  const subject = `Forum meeting cancelled: ${formatDayDate(meeting.date)}`;
  const { html, text } = renderCancellationBody(meeting, reason, ctx);
  await send(subject, html, text, attendees, ics, "cancel.ics");
}

async function send(
  subject: string,
  html: string,
  text: string,
  attendees: Attendee[],
  icsBody: string,
  filename: string
): Promise<void> {
  const resend = getResend();
  const recipients = attendees.map((a) => a.email);
  if (recipients.length === 0) return;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: recipients,
    subject,
    html,
    text,
    attachments: [
      {
        filename,
        content: Buffer.from(icsBody, "utf8"),
      },
    ],
  });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

function buildIcs(
  meeting: MeetingPayload,
  attendees: Attendee[],
  ctx: EmailContext,
  method: "REQUEST" | "CANCEL"
): string {
  const start = parseLocalDateTime(meeting.date, meeting.startTime);
  const end = parseLocalDateTime(meeting.date, meeting.endTime);

  const attrs: EventAttributes = {
    productId: PRODUCT_ID,
    uid: `${meeting.id}@magnificent8forum`,
    title: "Forum meeting",
    description: meeting.notes ?? "",
    location: meeting.location ?? "",
    start: [start.year, start.month, start.day, start.hour, start.minute],
    end: [end.year, end.month, end.day, end.hour, end.minute],
    startInputType: "local",
    startOutputType: "local",
    endInputType: "local",
    endOutputType: "local",
    organizer: { name: ctx.organizerName, email: ctx.organizerEmail },
    attendees: attendees.map((a) => ({
      name: a.name,
      email: a.email,
      rsvp: true,
      partstat: "NEEDS-ACTION",
    })),
    method,
    status: method === "CANCEL" ? "CANCELLED" : "CONFIRMED",
    sequence: method === "CANCEL" ? 1 : 0,
  };

  const { error, value } = createEvent(attrs);
  if (error || !value) {
    throw error ?? new Error("ics.createEvent returned no value");
  }

  // Attach TZID and inject the VTIMEZONE block. ics emits LF line endings;
  // .ics standard wants CRLF, which both ics and Resend tolerate, but the
  // VTIMEZONE block we add uses CRLF for consistency.
  let out = value
    .replace(/DTSTART:/g, `DTSTART;TZID=${TIMEZONE_ID}:`)
    .replace(/DTEND:/g, `DTEND;TZID=${TIMEZONE_ID}:`);
  out = out.replace(
    /BEGIN:VEVENT/,
    `${VTIMEZONE_BLOCK}\r\nBEGIN:VEVENT`
  );
  return out;
}

function parseLocalDateTime(
  dateStr: string,
  timeStr: string
): { year: number; month: number; day: number; hour: number; minute: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  return { year: y, month: m, day: d, hour: h, minute: mi };
}

function renderConfirmationBody(
  meeting: MeetingPayload,
  ctx: EmailContext
): { html: string; text: string } {
  const dateLong = formatLongDate(meeting.date);
  const timeRange = formatTimeRange(meeting.startTime, meeting.endTime);
  const calendarUrl = `${ctx.appUrl}/calendar`;

  const text = [
    `${dateLong}`,
    `${timeRange} (Bermuda time)`,
    meeting.location ? `Location: ${meeting.location}` : null,
    meeting.notes ? `\nNotes: ${meeting.notes}` : null,
    "",
    `Confirmed by ${ctx.organizerName}.`,
    `Open the forum app: ${calendarUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h1 style="font-size:20px;margin:0 0 12px;">Forum meeting confirmed</h1>
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;">${escapeHtml(dateLong)}</p>
      <p style="margin:0 0 16px;color:#475569;">${escapeHtml(timeRange)} (Bermuda time)</p>
      ${
        meeting.location
          ? `<p style="margin:0 0 8px;"><strong>Location:</strong> ${escapeHtml(meeting.location)}</p>`
          : ""
      }
      ${
        meeting.notes
          ? `<p style="margin:0 0 16px;white-space:pre-wrap;"><strong>Notes:</strong> ${escapeHtml(meeting.notes)}</p>`
          : ""
      }
      <p style="margin:16px 0 0;color:#475569;">Confirmed by ${escapeHtml(ctx.organizerName)}. The attached invite will add this meeting to your calendar.</p>
      <p style="margin:16px 0 0;"><a href="${escapeAttr(calendarUrl)}" style="color:#1d4ed8;">Open the forum app</a></p>
    </div>
  `;
  return { html, text };
}

function renderCancellationBody(
  meeting: MeetingPayload,
  reason: string | null,
  ctx: EmailContext
): { html: string; text: string } {
  const dateLong = formatLongDate(meeting.date);
  const calendarUrl = `${ctx.appUrl}/calendar`;

  const text = [
    `The forum meeting on ${dateLong} has been cancelled.`,
    reason ? `\nReason: ${reason}` : null,
    "",
    `Cancelled by ${ctx.organizerName}.`,
    `The attached calendar update will remove this event from your calendar.`,
    `Open the forum app: ${calendarUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h1 style="font-size:20px;margin:0 0 12px;">Forum meeting cancelled</h1>
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;">${escapeHtml(dateLong)}</p>
      ${
        reason
          ? `<p style="margin:0 0 16px;white-space:pre-wrap;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>`
          : ""
      }
      <p style="margin:0 0 8px;color:#475569;">Cancelled by ${escapeHtml(ctx.organizerName)}.</p>
      <p style="margin:0 0 16px;color:#475569;">The attached calendar update will remove this event from your calendar.</p>
      <p style="margin:16px 0 0;"><a href="${escapeAttr(calendarUrl)}" style="color:#1d4ed8;">Open the forum app</a></p>
    </div>
  `;
  return { html, text };
}

function formatDayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minutes = m.toString().padStart(2, "0");
  return `${hour12}:${minutes} ${period}`;
}

function formatTimeRange(start: string, end: string): string {
  const s = formatTime(start);
  const e = formatTime(end);
  const sParts = s.split(" ");
  const eParts = e.split(" ");
  if (sParts.length === 2 && eParts.length === 2 && sParts[1] === eParts[1]) {
    return `${sParts[0]}–${eParts[0]} ${eParts[1]}`;
  }
  return `${s}–${e}`;
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
