import { normalizeRegimenSchedule, regimenScheduleLabel, type RegimenSchedule } from "./regimenSchedule.ts";

export type RoutineCopilotKind = "medication" | "hormone" | "supplement" | "endocrine_active_supplement";

export type RoutineCopilotExtraction = {
  name_quote?: unknown;
  dose_quote?: unknown;
  schedule_quote?: unknown;
};

export type RoutineCopilotProposal = {
  name: string | null;
  dose: string | null;
  timing: string | null;
  schedule: RegimenSchedule | null;
  missingFields: string[];
  questions: string[];
  explanation: string;
  source: "ai" | "fallback";
};

export type RoutineScheduleContextItem = {
  name: string;
  schedule?: RegimenSchedule | null;
};

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function collapsed(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function verifiedQuote(sourceText: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const quote = collapsed(value);
  if (!quote || quote.length > 240) return null;
  return collapsed(sourceText).toLocaleLowerCase().includes(quote.toLocaleLowerCase()) ? quote : null;
}

function fallbackDose(sourceText: string): string | null {
  const match = sourceText.match(
    /\b\d+(?:\.\d+)?\s*(?:mcg|μg|ug|mg|g|ml|mL|units?|iu|IU|tablets?|tabs?|capsules?|caps?|puffs?|drops?|packets?|scoops?)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mcg|μg|ug|mg|g|ml|mL|units?|iu|IU))?/,
  );
  return match ? collapsed(match[0]) : null;
}

function fallbackScheduleQuote(sourceText: string): string | null {
  const source = collapsed(sourceText);
  if (!/\b(daily|every day|weekly|once (?:a|per) week|as needed|prn|morning|afternoon|evening|bedtime|monday|tuesday|wednesday|thursday|friday|saturday|sunday|every \d+ days?|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i.test(source)) {
    return null;
  }
  return source;
}

function timeValues(text: string): string[] {
  const found: string[] = [];
  const pattern = /\b((?:[01]?\d|2[0-3]):[0-5]\d|(?:0?[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?))\b/gi;
  for (const match of text.matchAll(pattern)) {
    const raw = match[1].toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
    if (/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(raw)) {
      const [hour, minute] = raw.split(":").map(Number);
      found.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
      continue;
    }
    const parsed = raw.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
    if (!parsed) continue;
    let hour = Number(parsed[1]) % 12;
    if (parsed[3] === "pm") hour += 12;
    found.push(`${String(hour).padStart(2, "0")}:${parsed[2] ?? "00"}`);
  }
  return [...new Set(found)].sort();
}

function weekdayValues(text: string): number[] {
  return Object.entries(DAY_INDEX)
    .filter(([day]) => new RegExp(`\\b${day}(?:s)?\\b`, "i").test(text))
    .map(([, index]) => index)
    .sort();
}

export function deriveRoutineSchedule(text: string): RegimenSchedule | null {
  const normalized = collapsed(text);
  if (!normalized) return null;
  if (/\b(as needed|prn)\b/i.test(normalized)) {
    return normalizeRegimenSchedule({ cadence: "as_needed", times: [], weekdays: [], interval_days: null, anchor_date: null });
  }

  const times = timeValues(normalized);
  if (!times.length) return null;
  const weekdays = weekdayValues(normalized);

  if (weekdays.length > 1) {
    return normalizeRegimenSchedule({ cadence: "weekdays", times, weekdays, interval_days: null, anchor_date: null });
  }
  if (weekdays.length === 1 && /\b(weekly|once (?:a|per) week)\b/i.test(normalized)) {
    return normalizeRegimenSchedule({ cadence: "weekly", times, weekdays, interval_days: null, anchor_date: null });
  }
  if (/\b(daily|every day|each day|once daily|twice daily|three times daily)\b/i.test(normalized)) {
    return normalizeRegimenSchedule({ cadence: "daily", times, weekdays: [], interval_days: null, anchor_date: null });
  }
  return null;
}

function missingScheduleQuestion(timing: string | null): string {
  if (!timing) return "What cadence, days, and exact times are written in your current instructions?";
  if (/\bevery\s+(\d+)\s+days?\b/i.test(timing)) return "What starting date should anchor this every-few-days schedule?";
  if (/\b(weekly|once (?:a|per) week)\b/i.test(timing) && !weekdayValues(timing).length) {
    return "Which day of the week is written in your current instructions?";
  }
  if (/\b(morning|afternoon|evening|bedtime|night)\b/i.test(timing) && !timeValues(timing).length) {
    return "What exact clock time do you want on the checklist? Keep following your current label or clinician instructions.";
  }
  return "Can you confirm the cadence, days, and exact times before adding this to the checklist?";
}

function scheduleExplanation(schedule: RegimenSchedule | null, timing: string | null) {
  if (!schedule) {
    return timing
      ? "The written schedule is preserved, but the checklist still needs a supported cadence and exact time."
      : "No schedule was organized. Your existing routine will remain unchanged until you confirm the missing details.";
  }
  if (schedule.cadence === "as_needed") return "This stays off the automatic checklist and can be recorded only when you choose to take it under your existing instructions.";
  const occurrences = schedule.times.length;
  return `${regimenScheduleLabel(schedule)}. This creates ${occurrences} checklist ${occurrences === 1 ? "time" : "times"} on each scheduled day.`;
}

export function buildRoutineCopilotProposal({
  sourceText,
  kind,
  extraction,
  existingName,
}: {
  sourceText: string;
  kind: RoutineCopilotKind;
  extraction?: RoutineCopilotExtraction | null;
  existingName?: string | null;
}): RoutineCopilotProposal {
  const source = collapsed(sourceText).slice(0, 1200);
  const aiName = verifiedQuote(source, extraction?.name_quote);
  const aiDose = verifiedQuote(source, extraction?.dose_quote);
  const aiTiming = verifiedQuote(source, extraction?.schedule_quote);
  const dose = aiDose ?? fallbackDose(source);
  const timing = aiTiming ?? fallbackScheduleQuote(source);
  const schedule = deriveRoutineSchedule(timing ?? "");
  const name = existingName?.trim() || aiName;
  const missingFields: string[] = [];
  const questions: string[] = [];

  if (!name) {
    missingFields.push("Item name");
    questions.push(`What ${kind === "hormone" ? "hormone therapy" : kind} name is printed on the label?`);
  }
  if (!dose) {
    missingFields.push("Amount at each scheduled time");
    questions.push("What amount and unit are written for one scheduled time?");
  }
  if (!schedule) {
    missingFields.push("Checklist schedule");
    questions.push(missingScheduleQuestion(timing));
  }

  return {
    name,
    dose,
    timing,
    schedule,
    missingFields,
    questions: [...new Set(questions)],
    explanation: scheduleExplanation(schedule, timing),
    source: aiName || aiDose || aiTiming ? "ai" : "fallback",
  };
}

export function addRoutineScheduleContext(
  proposal: RoutineCopilotProposal,
  items: RoutineScheduleContextItem[],
  existingName?: string | null,
): RoutineCopilotProposal {
  if (!proposal.schedule || proposal.schedule.cadence === "as_needed") return proposal;
  const proposedTimes = new Set(proposal.schedule.times);
  const sameName = existingName?.trim().toLocaleLowerCase();
  const shared = items.filter((item) => {
    if (!item.schedule || item.name.trim().toLocaleLowerCase() === sameName) return false;
    return item.schedule.times.some((time) => proposedTimes.has(time));
  });
  if (!shared.length) return proposal;

  const names = shared.slice(0, 3).map((item) => item.name).join(", ");
  const extra = shared.length > 3 ? ` and ${shared.length - 3} more` : "";
  return {
    ...proposal,
    explanation: `${proposal.explanation} It shares a checklist time with ${names}${extra}, so that part of the routine may feel busier. This is an organization note, not an interaction or safety assessment.`,
    questions: [...proposal.questions, "Do you want these items grouped at the same checklist time, based on the instructions you already follow?"],
  };
}
