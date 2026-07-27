import "server-only";

import { Resend } from "resend";

export type ReminderKind = "practice" | "recovery" | "weekly_review";
export type ReminderSkipReason =
  | "wrong_hour"
  | "quiet_hours"
  | "before_week"
  | "review_complete"
  | "completed_today";

type LocalClock = {
  date: string;
  hour: number;
};

type ReminderDecisionInput = {
  now: Date;
  timezone: string;
  cueHour: number;
  quietStartHour: number;
  quietEndHour: number;
  weekStart: string;
  completedDates: string[];
  reviewCompleted: boolean;
};

export function localClock(now: Date, timezone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
  };
}

export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function evaluateReminder(input: ReminderDecisionInput):
  | { decision: { kind: ReminderKind; localDate: string }; reason: null }
  | { decision: null; reason: ReminderSkipReason } {
  const clock = localClock(input.now, input.timezone);
  if (clock.hour !== input.cueHour) return { decision: null, reason: "wrong_hour" };
  if (isQuietHour(clock.hour, input.quietStartHour, input.quietEndHour)) {
    return { decision: null, reason: "quiet_hours" };
  }

  const weekEnd = addDays(input.weekStart, 6);
  if (clock.date < input.weekStart) return { decision: null, reason: "before_week" };
  if (clock.date >= weekEnd) {
    return input.reviewCompleted
      ? { decision: null, reason: "review_complete" }
      : { decision: { kind: "weekly_review", localDate: clock.date }, reason: null };
  }
  if (input.completedDates.includes(clock.date)) return { decision: null, reason: "completed_today" };

  const yesterday = addDays(clock.date, -1);
  const missedYesterday = yesterday >= input.weekStart && !input.completedDates.includes(yesterday);
  return {
    decision: { kind: missedYesterday ? "recovery" : "practice", localDate: clock.date },
    reason: null,
  };
}

export function decideReminder(input: ReminderDecisionInput): { kind: ReminderKind; localDate: string } | null {
  return evaluateReminder(input).decision;
}

export function reminderIdempotencyKey(kind: ReminderKind, experimentId: string, localDate: string): string {
  return kind === "weekly_review"
    ? `reminder:${kind}:${experimentId}:due`
    : `reminder:${kind}:${experimentId}:${localDate}`;
}

function content(kind: ReminderKind) {
  if (kind === "weekly_review") {
    return {
      subject: "Your LVE360 weekly review is ready",
      heading: "Notice what worked this week",
      body: "Your weekly review is ready. Take a few minutes to notice what helped, adjust what did not, and shape your next focused week.",
      cta: "Open weekly review",
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
  return {
    subject: "Your small LVE360 practice for today",
    heading: "Make the next repetition easy",
    body: "Your focused practice is ready when you are. A small version counts, especially on a full day.",
    cta: "Open today",
  };
}

export async function sendReminderEmail(input: {
  to: string;
  kind: ReminderKind;
  deepLink: string;
  idempotencyKey: string;
}): Promise<{ status: "sent"; providerId: string } | { status: "failed"; reason: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { status: "failed", reason: "resend_not_configured" };
  const copy = content(input.kind);
  const safeLink = input.deepLink.replace(/"/g, "&quot;");
  const settingsLink = new URL("/settings", input.deepLink).toString().replace(/"/g, "&quot;");
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
        <a href="${safeLink}" style="display:inline-block;margin-top:12px;background:#08a88a;color:white;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">${copy.cta}</a>
        <p style="margin-top:28px;font-size:12px;color:#64748b">Manage or turn off reminders in <a href="${settingsLink}">Settings</a>.</p>
      </div>`,
      text: `${copy.heading}\n\n${copy.body}\n\n${copy.cta}: ${input.deepLink}\n\nManage reminders in LVE360 Settings.`,
    }, { idempotencyKey: input.idempotencyKey });
    if (error || !data?.id) return { status: "failed", reason: "provider_rejected" };
    return { status: "sent", providerId: data.id };
  } catch {
    return { status: "failed", reason: "send_failed" };
  }
}
