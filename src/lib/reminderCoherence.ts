import { isQuietHour, type ReminderTiming } from "./reminderSchedule.ts";

export type PracticeCuePeriod = "morning" | "midday" | "evening";

export type ReminderPlanIssue = {
  code: "reminder_conflicts_with_cue";
  message: string;
  cuePeriod: PracticeCuePeriod;
};

type CueContext = {
  period: PracticeCuePeriod;
  explicitHour: number | null;
};

const MORNING_RE = /\b(?:wake(?:\s+up)?|waking|alarm|morning|breakfast|coffee|start(?:ing)?\s+(?:my|the)\s+day)\b/i;
const MIDDAY_RE = /\b(?:lunch|noon|midday|mid-day|afternoon)\b/i;
const EVENING_RE = /\b(?:dinner|supper|evening|night|bed(?:time)?|go\s+to\s+bed|wind[-\s]?down|brush(?:ing)?\s+(?:my\s+)?teeth)\b/i;
const EXPLICIT_TIME_RE = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i;

function periodForHour(hour: number): PracticeCuePeriod {
  if (hour >= 4 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "midday";
  return "evening";
}

function cueContext(cue: string | null | undefined): CueContext | null {
  const value = String(cue ?? "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  const explicit = value.match(EXPLICIT_TIME_RE);
  if (explicit) {
    const rawHour = Number(explicit[1]);
    const isPm = explicit[3].toLowerCase().startsWith("p");
    const hour = (rawHour % 12) + (isPm ? 12 : 0);
    return { period: periodForHour(hour), explicitHour: hour };
  }
  if (EVENING_RE.test(value)) return { period: "evening", explicitHour: null };
  if (MIDDAY_RE.test(value)) return { period: "midday", explicitHour: null };
  if (MORNING_RE.test(value)) return { period: "morning", explicitHour: null };
  return null;
}

export function inferPracticeCuePeriod(cue: string | null | undefined): PracticeCuePeriod | null {
  return cueContext(cue)?.period ?? null;
}

function circularHoursUntil(fromHour: number, toHour: number): number {
  return (toHour - fromHour + 24) % 24;
}

function matchesCue(context: CueContext, timing: ReminderTiming, hour: number): boolean {
  if (timing === "account_default") return true;
  if (timing === "next_day") return hour >= 5 && hour < 12;

  if (context.explicitHour != null) {
    if (timing === "at_cue") {
      const forward = circularHoursUntil(hour, context.explicitHour);
      const backward = circularHoursUntil(context.explicitHour, hour);
      return Math.min(forward, backward) <= 2;
    }
    const leadTime = circularHoursUntil(hour, context.explicitHour);
    return leadTime <= 12;
  }

  if (timing === "at_cue") {
    if (context.period === "morning") return hour >= 4 && hour < 12;
    if (context.period === "midday") return hour >= 10 && hour < 17;
    return hour >= 16;
  }

  if (context.period === "morning") return hour >= 17 || (hour >= 4 && hour < 10);
  if (context.period === "midday") return hour >= 5 && hour < 15;
  return hour >= 12 && hour < 22;
}

function periodLabel(period: PracticeCuePeriod): string {
  if (period === "morning") return "morning";
  if (period === "midday") return "midday or afternoon";
  return "evening or bedtime";
}

export function reminderPlanIssue(input: {
  cue: string | null | undefined;
  timing: ReminderTiming;
  hour: number | null | undefined;
}): ReminderPlanIssue | null {
  if (input.timing === "account_default" || !Number.isInteger(input.hour)) return null;
  const context = cueContext(input.cue);
  if (input.timing === "next_day" && (Number(input.hour) < 5 || Number(input.hour) >= 12)) {
    return {
      code: "reminder_conflicts_with_cue",
      message: "A next-morning check-in needs a morning delivery time.",
      cuePeriod: context?.period ?? "morning",
    };
  }
  if (!context || matchesCue(context, input.timing, Number(input.hour))) return null;
  const label = periodLabel(context.period);
  const message = input.timing === "prepare_before"
      ? `That preparation time is too far from your ${label} cue to feel timely.`
      : `That delivery time does not match your ${label} cue.`;
  return { code: "reminder_conflicts_with_cue", message, cuePeriod: context.period };
}

export function coherentReminderHours(input: {
  cue: string | null | undefined;
  timing: ReminderTiming;
  quietStartHour: number;
  quietEndHour: number;
}): number[] {
  return Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => (
    !isQuietHour(hour, input.quietStartHour, input.quietEndHour)
    && !reminderPlanIssue({ cue: input.cue, timing: input.timing, hour })
  ));
}

function preferredHours(period: PracticeCuePeriod | null, timing: ReminderTiming): number[] {
  if (timing === "next_day") return [8, 7, 9, 6, 10, 5, 11];
  if (timing === "prepare_before") {
    if (period === "morning") return [20, 19, 21, 18, 22, 6, 5, 7, 8, 9, 4, 23];
    if (period === "midday") return [9, 8, 10, 7, 11, 6, 12, 5, 13, 14];
    if (period === "evening") return [20, 19, 18, 17, 16, 15, 14, 13, 12, 21];
    return [20, 19, 18, 17, 16, 15, 14, 13, 12];
  }
  if (period === "morning") return [7, 6, 8, 5, 9, 10, 11, 4];
  if (period === "midday") return [12, 13, 11, 14, 10, 15, 16];
  if (period === "evening") return [19, 20, 18, 21, 17, 22, 16, 23];
  return [18, 17, 19, 16, 20, 15, 21, 14, 22, 13, 23, 12];
}

export function recommendedReminderHour(input: {
  cue: string | null | undefined;
  timing: ReminderTiming;
  quietStartHour: number;
  quietEndHour: number;
}): number | null {
  const allowed = coherentReminderHours(input);
  const allowedSet = new Set(allowed);
  return preferredHours(inferPracticeCuePeriod(input.cue), input.timing).find((hour) => allowedSet.has(hour))
    ?? allowed[0]
    ?? null;
}
