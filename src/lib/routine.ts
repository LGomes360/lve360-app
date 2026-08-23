import type { RegimenInstructionAuthority } from "./medicationRecord.ts";
import type { RecommendationDecisionStatus } from "./recommendationDecision.ts";
import {
  isRegimenScheduleDue,
  localDateString,
  regimenDoseSlots,
  regimenScheduleLabel,
  type RegimenSchedule,
} from "./regimenSchedule.ts";

export type RoutineItemKind = "medication" | "supplement" | "hormone" | "endocrine_active_supplement";
export type RoutineSourceType = "regimen" | "blueprint_proposal";

export type RoutineScheduleConflict = {
  code: "cadence" | "frequency" | "time_of_day" | "exact_time";
  reason: string;
};

export type RoutineItem = {
  id: string;
  stack_id: string | null;
  name: string;
  brand: string | null;
  reorder_url: string | null;
  image_url: string | null;
  product_source: "fullscript" | "fallback" | "member" | null;
  product_sku: string | null;
  purpose: string | null;
  dose: string | null;
  timing: string | null;
  timing_text?: string | null;
  notes: string | null;
  recommendation_status?: RecommendationDecisionStatus | null;
  recommendation_reason?: string | null;
  recommendation_overlaps?: string[];
  item_kind: RoutineItemKind;
  instruction_source?: "intake" | "member_update" | "adopted_recommendation" | "manual_add" | null;
  instruction_authority?: RegimenInstructionAuthority | null;
  schedule?: RegimenSchedule | null;
  active?: boolean;
  is_current: boolean;
  source_type: RoutineSourceType;
  link_amazon: string | null;
  link_fullscript: string | null;
  refill_days_left: number | null;
  last_refilled_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export const ROUTINE_SECTION_ORDER = [
  "medication",
  "hormone",
  "supplement",
  "endocrine_active_supplement",
] as const;

export const ROUTINE_SECTION_LABELS: Record<RoutineItemKind, string> = {
  medication: "Prescriptions",
  hormone: "Hormones",
  supplement: "Supplements",
  endocrine_active_supplement: "Hormone-active items",
};

export function groupRoutineItems(items: RoutineItem[]) {
  const current = items.filter((item) => item.source_type === "regimen" && item.is_current && item.active !== false);
  return {
    current,
    proposals: items.filter((item) => item.source_type === "blueprint_proposal"),
    byKind: Object.fromEntries(
      ROUTINE_SECTION_ORDER.map((kind) => [kind, current.filter((item) => item.item_kind === kind)])
    ) as Record<RoutineItemKind, RoutineItem[]>,
  };
}

export function routineScheduleLabel(item: Pick<RoutineItem, "timing" | "timing_text" | "schedule">): string {
  if (item.schedule) return regimenScheduleLabel(item.schedule);
  return item.timing?.trim() || item.timing_text?.trim() || "Schedule not recorded";
}

export function routineWrittenScheduleLabel(
  item: Pick<RoutineItem, "timing" | "timing_text">
): string | null {
  return item.timing_text?.trim() || item.timing?.trim() || null;
}

/**
 * Finds clear contradictions between a member's saved written instruction and
 * the structured checklist. Ambiguous language is intentionally left alone.
 * The caller must ask the member to reconcile a conflict rather than changing
 * either record automatically.
 */
export function routineScheduleConflicts(
  item: Pick<RoutineItem, "timing" | "timing_text" | "schedule">
): RoutineScheduleConflict[] {
  const written = routineWrittenScheduleLabel(item);
  if (!written || !item.schedule) return [];

  const checklist = regimenScheduleLabel(item.schedule);
  const normalizedWritten = normalizeScheduleText(written);
  if (!normalizedWritten || normalizedWritten === normalizeScheduleText(checklist)) return [];

  const conflicts: RoutineScheduleConflict[] = [];
  const expectedCadence = cadenceFromWrittenSchedule(normalizedWritten);
  if (expectedCadence && !expectedCadenceMatches(expectedCadence, item.schedule)) {
    conflicts.push({
      code: "cadence",
      reason: "The written cadence and checklist cadence do not match.",
    });
  }

  const expectedFrequency = dailyFrequencyFromWrittenSchedule(normalizedWritten);
  if (expectedFrequency && expectedFrequency !== item.schedule.times.length) {
    conflicts.push({
      code: "frequency",
      reason: `The written schedule describes ${expectedFrequency} time${expectedFrequency === 1 ? "" : "s"} per scheduled day, but the checklist contains ${item.schedule.times.length}.`,
    });
  }

  const writtenPeriods = timePeriodsFromWrittenSchedule(normalizedWritten);
  const checklistPeriods = new Set(item.schedule.times.map((time) => Number(time.slice(0, 2)) < 12 ? "am" : "pm"));
  if (writtenPeriods.size === 1 && checklistPeriods.size === 1 && !checklistPeriods.has([...writtenPeriods][0])) {
    conflicts.push({
      code: "time_of_day",
      reason: "The written time of day and checklist time of day do not match.",
    });
  } else if (writtenPeriods.size === 2 && checklistPeriods.size !== 2) {
    conflicts.push({
      code: "time_of_day",
      reason: "The written schedule includes both morning and evening, but the checklist does not.",
    });
  }

  const writtenTimes = clockTimesFromWrittenSchedule(written);
  if (writtenTimes.length && writtenTimes.length === item.schedule.times.length) {
    const checklistTimes = [...item.schedule.times].sort();
    if (writtenTimes.some((time, index) => time !== checklistTimes[index])) {
      conflicts.push({
        code: "exact_time",
        reason: "The exact written time and checklist time do not match.",
      });
    }
  }

  return conflicts.filter((conflict, index, all) => all.findIndex((candidate) => candidate.code === conflict.code) === index);
}

type WrittenCadence = "daily" | "every_other_day" | "weekly" | "as_needed";

function normalizeScheduleText(value: string): string {
  return value.toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
}

function cadenceFromWrittenSchedule(value: string): WrittenCadence | null {
  if (/\b(?:as needed|prn)\b/.test(value)) return "as_needed";
  if (/\b(?:every other day|every 2 days)\b/.test(value)) return "every_other_day";
  if (/\b(?:once weekly|weekly|once (?:a|per) week|every week)\b/.test(value)) return "weekly";
  if (/\b(?:daily|every day|once (?:a|per) day|twice (?:a|per) day|\d+\s*(?:x|times?)\s*(?:a|per) day)\b/.test(value)) return "daily";
  return null;
}

function expectedCadenceMatches(expected: WrittenCadence, schedule: RegimenSchedule): boolean {
  if (expected === "every_other_day") return schedule.cadence === "every_n_days" && schedule.interval_days === 2;
  return schedule.cadence === expected;
}

function dailyFrequencyFromWrittenSchedule(value: string): number | null {
  if (/\b(?:am\s*[/&+]\s*pm|morning\s+(?:and|&)\s+(?:evening|night)|twice (?:daily|a day|per day))\b/.test(value)) return 2;
  if (/\b(?:three times|3\s*(?:x|times?))\s*(?:daily|a day|per day)?\b/.test(value)) return 3;
  if (/\b(?:four times|4\s*(?:x|times?))\s*(?:daily|a day|per day)?\b/.test(value)) return 4;
  if (/\b(?:once daily|once a day|once per day|one time daily)\b/.test(value)) return 1;
  const numeric = value.match(/\b([1-6])\s*(?:x|times?)\s*(?:a|per)\s*day\b/);
  return numeric ? Number(numeric[1]) : null;
}

function timePeriodsFromWrittenSchedule(value: string): Set<"am" | "pm"> {
  const periods = new Set<"am" | "pm">();
  if (/\b(?:morning|am)\b/.test(value)) periods.add("am");
  if (/\b(?:afternoon|evening|night|bedtime|pm)\b/.test(value)) periods.add("pm");
  return periods;
}

function clockTimesFromWrittenSchedule(value: string): string[] {
  const times = new Set<string>();
  const twelveHour = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/gi;
  for (const match of value.matchAll(twelveHour)) {
    let hour = Number(match[1]) % 12;
    if (match[3].toLowerCase().startsWith("p")) hour += 12;
    times.add(`${String(hour).padStart(2, "0")}:${match[2] ?? "00"}`);
  }
  const twentyFourHour = /\b([01]\d|2[0-3]):([0-5]\d)\b/g;
  for (const match of value.matchAll(twentyFourHour)) times.add(`${match[1]}:${match[2]}`);
  return [...times].sort();
}

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function isRoutineItemDueToday(
  item: Pick<RoutineItem, "timing" | "timing_text" | "schedule">,
  today = new Date()
): boolean {
  if (item.schedule) return isRegimenScheduleDue(item.schedule, localDateString(today));
  const schedule = routineScheduleLabel(item).toLowerCase();
  if (schedule === "schedule not recorded" || /\b(as needed|prn)\b/.test(schedule)) return false;
  const namedDays = Object.entries(DAY_INDEX)
    .filter(([day]) => new RegExp(`\\b${day}(?:s)?\\b`, "i").test(schedule))
    .map(([, index]) => index);
  if (namedDays.length) return namedDays.includes(today.getDay());
  if (/\bweekly|once (?:a|per) week\b/.test(schedule)) return false;
  return true;
}

export function getRoutineTodaySummary(items: RoutineItem[], today = new Date()) {
  const { current, proposals } = groupRoutineItems(items);
  const date = localDateString(today);
  return {
    dueToday: current.reduce(
      (total, item) => total + (item.schedule ? regimenDoseSlots(item.schedule, date).length : 0),
      0,
    ),
    scheduleReview: current.filter((item) => !item.schedule).length,
    ideasToConsider: proposals.length,
  };
}

export function routineSourceLabel(source: RoutineItem["instruction_source"]): string {
  if (source === "member_update") return "Updated by you";
  if (source === "adopted_recommendation") return "Added from your Blueprint";
  if (source === "manual_add") return "Added by you";
  return "From your intake";
}

export function routineInstructionAuthorityLabel(authority: RoutineItem["instruction_authority"]): string | null {
  if (authority === "clinician") return "Instruction reported from your clinician or prescriber";
  if (authority === "pharmacist") return "Instruction reported from your healthcare provider";
  if (authority === "medication_label") return "Instruction recorded from your medication label";
  if (authority === "product_label") return "Instruction recorded from your product label";
  return null;
}

export function isClinicianReviewProposal(item: Pick<RoutineItem, "notes" | "recommendation_status">): boolean {
  return item.recommendation_status === "clinician_review"
    || /clinician review|pharmacist|interaction|contraindicat|use caution|avoid/i.test(item.notes ?? "");
}
