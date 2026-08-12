export const REMINDER_TIMINGS = [
  "account_default",
  "prepare_before",
  "at_cue",
  "next_day",
] as const;

export type ReminderTiming = (typeof REMINDER_TIMINGS)[number];
export type ReminderKind = "practice" | "recovery" | "next_day_checkin" | "weekly_review";
export type ReminderSkipReason =
  | "wrong_hour"
  | "quiet_hours"
  | "before_week"
  | "before_first_checkin"
  | "review_complete"
  | "completed_today"
  | "completed_target"
  | "target_met"
  | "daily_limit";

export type ReminderDecision = {
  kind: ReminderKind;
  localDate: string;
  targetDate: string;
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
  targetCount: number;
  timing: ReminderTiming;
};

export function isReminderTiming(value: unknown): value is ReminderTiming {
  return typeof value === "string" && REMINDER_TIMINGS.includes(value as ReminderTiming);
}

export function localClock(now: Date, timezone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
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
  | { decision: ReminderDecision; reason: null }
  | { decision: null; reason: ReminderSkipReason; localDate: string } {
  const clock = localClock(input.now, input.timezone);
  if (clock.hour !== input.cueHour) return { decision: null, reason: "wrong_hour", localDate: clock.date };
  if (isQuietHour(clock.hour, input.quietStartHour, input.quietEndHour)) {
    return { decision: null, reason: "quiet_hours", localDate: clock.date };
  }

  const weekEnd = addDays(input.weekStart, 6);
  if (clock.date < input.weekStart) return { decision: null, reason: "before_week", localDate: clock.date };
  if (clock.date >= weekEnd) {
    return input.reviewCompleted
      ? { decision: null, reason: "review_complete", localDate: clock.date }
      : { decision: { kind: "weekly_review", localDate: clock.date, targetDate: weekEnd }, reason: null };
  }

  const uniqueCompletions = new Set(input.completedDates);
  if (uniqueCompletions.size >= input.targetCount) {
    return { decision: null, reason: "target_met", localDate: clock.date };
  }

  if (input.timing === "next_day") {
    const targetDate = addDays(clock.date, -1);
    if (targetDate < input.weekStart) {
      return { decision: null, reason: "before_first_checkin", localDate: clock.date };
    }
    if (uniqueCompletions.has(targetDate)) {
      return { decision: null, reason: "completed_target", localDate: clock.date };
    }
    return {
      decision: { kind: "next_day_checkin", localDate: clock.date, targetDate },
      reason: null,
    };
  }

  if (uniqueCompletions.has(clock.date)) {
    return { decision: null, reason: "completed_today", localDate: clock.date };
  }
  const yesterday = addDays(clock.date, -1);
  const missedYesterday = yesterday >= input.weekStart && !uniqueCompletions.has(yesterday);
  return {
    decision: {
      kind: missedYesterday ? "recovery" : "practice",
      localDate: clock.date,
      targetDate: clock.date,
    },
    reason: null,
  };
}

export function effectiveReminderHour(
  timing: ReminderTiming,
  practiceHour: number | null | undefined,
  accountHour: number,
): number {
  return timing === "account_default" || !Number.isInteger(practiceHour)
    ? accountHour
    : Number(practiceHour);
}

export function reminderIdempotencyKey(
  kind: ReminderKind,
  experimentId: string,
  localDate: string,
  targetDate = localDate,
): string {
  if (kind === "weekly_review") return `reminder:${kind}:${experimentId}:due`;
  return `reminder:${kind}:${experimentId}:${localDate}:${targetDate}`;
}

export function skippedReminderIdempotencyKey(
  experimentId: string,
  localDate: string,
  reason: ReminderSkipReason,
): string {
  return `reminder:skipped:${experimentId}:${localDate}:${reason}`;
}

export function shouldLedgerSkip(reason: ReminderSkipReason): boolean {
  return ["quiet_hours", "review_complete", "completed_today", "completed_target", "target_met", "daily_limit"].includes(reason);
}
