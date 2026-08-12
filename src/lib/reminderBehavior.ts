import { isQuietHour } from "./reminderSchedule.ts";

export const REMINDER_FEEDBACK_TYPES = [
  "useful",
  "too_early",
  "too_late",
  "not_useful",
  "dismissed",
] as const;

export type ReminderFeedbackType = (typeof REMINDER_FEEDBACK_TYPES)[number];

export type ReminderBehaviorSuggestion =
  | {
      kind: "time";
      currentHour: number;
      proposedHour: number;
      reason: "feedback_too_early" | "feedback_too_late" | "completion_pattern";
      evidenceCount: number;
    }
  | {
      kind: "pause";
      currentHour: number;
      proposedHour: null;
      reason: "repeated_not_useful";
      evidenceCount: number;
    };

type ReminderBehaviorInput = {
  currentHour: number;
  quietStartHour: number;
  quietEndHour: number;
  feedback: ReminderFeedbackType[];
  completionHours: number[];
};

export function isReminderFeedbackType(value: unknown): value is ReminderFeedbackType {
  return typeof value === "string" && REMINDER_FEEDBACK_TYPES.includes(value as ReminderFeedbackType);
}

function proposedTime(
  input: ReminderBehaviorInput,
  direction: -1 | 1,
  reason: "feedback_too_early" | "feedback_too_late" | "completion_pattern",
  evidenceCount: number,
): ReminderBehaviorSuggestion | null {
  const proposedHour = (input.currentHour + direction + 24) % 24;
  if (isQuietHour(proposedHour, input.quietStartHour, input.quietEndHour)) return null;
  return { kind: "time", currentHour: input.currentHour, proposedHour, reason, evidenceCount };
}

export function buildReminderBehaviorSuggestion(input: ReminderBehaviorInput): ReminderBehaviorSuggestion | null {
  const earlyCount = input.feedback.filter((value) => value === "too_early").length;
  const lateCount = input.feedback.filter((value) => value === "too_late").length;
  const notUsefulCount = input.feedback.filter((value) => value === "not_useful" || value === "dismissed").length;

  if (earlyCount >= 2 && earlyCount > lateCount) {
    return proposedTime(input, 1, "feedback_too_early", earlyCount);
  }
  if (lateCount >= 2 && lateCount > earlyCount) {
    return proposedTime(input, -1, "feedback_too_late", lateCount);
  }

  const validCompletionHours = input.completionHours
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)
    .sort((left, right) => left - right);
  if (validCompletionHours.length >= 3) {
    const medianHour = validCompletionHours[Math.floor(validCompletionHours.length / 2)];
    const difference = medianHour - input.currentHour;
    if (Math.abs(difference) >= 2) {
      return proposedTime(input, difference > 0 ? 1 : -1, "completion_pattern", validCompletionHours.length);
    }
  }

  if (notUsefulCount >= 2) {
    return {
      kind: "pause",
      currentHour: input.currentHour,
      proposedHour: null,
      reason: "repeated_not_useful",
      evidenceCount: notUsefulCount,
    };
  }
  return null;
}

export function sameReminderSuggestion(
  suggestion: ReminderBehaviorSuggestion,
  adjustment: { adjustment_kind: string; current_hour: number | null; proposed_hour: number | null },
): boolean {
  return suggestion.kind === adjustment.adjustment_kind
    && suggestion.currentHour === adjustment.current_hour
    && suggestion.proposedHour === adjustment.proposed_hour;
}
