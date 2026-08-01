import "server-only";

import { Resend } from "resend";
import type { ReminderKind, ReminderTiming } from "@/lib/reminderSchedule";

export {
  addDays,
  effectiveReminderHour,
  evaluateReminder,
  isQuietHour,
  reminderIdempotencyKey,
  shouldLedgerSkip,
  skippedReminderIdempotencyKey,
} from "@/lib/reminderSchedule";

function content(kind: ReminderKind, timing: ReminderTiming) {
  if (kind === "weekly_review") {
    return {
      subject: "Your LVE360 weekly review is ready",
      heading: "Notice what worked this week",
      body: "Your weekly review is ready. Take a few minutes to notice what helped, adjust what did not, and shape your next focused week.",
      cta: "Open weekly review",
    };
  }
  if (kind === "next_day_checkin") {
    return {
      subject: "A quick check-in for yesterday's practice",
      heading: "Did yesterday's practice happen?",
      body: "You did not need to use your phone after the practice. Record it now if it happened, or simply use the information to shape today.",
      cta: "Check in for yesterday",
    };
  }
  if (kind === "recovery") {
    return {
      subject: "A small restart still counts",
      heading: "Today is a fresh chance",
      body: "Missing a day is information, not failure. Return with the smallest useful version of your practice and keep the week moving.",
      cta: "Open today",
    };
  }
  if (timing === "prepare_before") {
    return {
      subject: "Make your next LVE360 practice easier",
      heading: "Prepare before your cue",
      body: "A small setup now can protect the practice later without asking you to interrupt the moment itself.",
      cta: "Open today's practice",
    };
  }
  return {
    subject: "Your LVE360 practice cue is here",
    heading: timing === "at_cue" ? "Your cue is here" : "Make the next repetition easy",
    body: "Your focused practice is ready when you are. A small version counts, especially on a full day.",
    cta: "Open today",
  };
}

export async function sendReminderEmail(input: {
  to: string;
  kind: ReminderKind;
  timing: ReminderTiming;
  actionLabel: string;
  minimumVersion: string;
  deepLink: string;
  idempotencyKey: string;
}): Promise<{ status: "accepted"; providerId: string } | { status: "failed"; reason: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { status: "failed", reason: "resend_not_configured" };
  const copy = content(input.kind, input.timing);
  const safeLink = input.deepLink.replace(/"/g, "&quot;");
  const settingsLink = new URL("/settings", input.deepLink).toString().replace(/"/g, "&quot;");
  const safeAction = escapeHtml(input.actionLabel);
  const safeMinimum = escapeHtml(input.minimumVersion);
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: process.env.REPORT_EMAIL_FROM?.trim() || "LVE360 <reports@lve360.com>",
      replyTo: process.env.REPORT_EMAIL_REPLY_TO?.trim() || "support@lve360.com",
      to: input.to,
      subject: copy.subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#17324d">
        <p style="font-weight:700;color:#087f72">LVE360</p>
        <h1 style="font-size:24px">${copy.heading}</h1>
        <p style="font-size:16px;line-height:1.6">${copy.body}</p>
        <div style="margin-top:20px;padding:16px;border:1px solid #bce3da;border-radius:12px;background:#f4faf8">
          <p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;color:#087f72">Your practice</p>
          <p style="margin:8px 0 0;font-size:16px;font-weight:700">${safeAction}</p>
          <p style="margin:12px 0 0;font-size:13px;color:#475569"><strong>Minimum version:</strong> ${safeMinimum}</p>
        </div>
        <a href="${safeLink}" style="display:inline-block;margin-top:12px;background:#08a88a;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">${copy.cta}</a>
        <p style="margin-top:28px;font-size:12px;color:#64748b">Manage or turn off reminders in <a href="${settingsLink}">Settings</a>.</p>
      </div>`,
      text: `${copy.heading}\n\n${copy.body}\n\nYour practice: ${input.actionLabel}\nMinimum version: ${input.minimumVersion}\n\n${copy.cta}: ${input.deepLink}\n\nManage reminders in LVE360 Settings.`,
    }, { idempotencyKey: input.idempotencyKey });
    if (error || !data?.id) return { status: "failed", reason: "provider_rejected" };
    return { status: "accepted", providerId: data.id };
  } catch {
    return { status: "failed", reason: "send_failed" };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
