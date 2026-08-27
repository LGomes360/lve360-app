import { cleanText, isSafeLifestyleAction, type WeeklyExperiment } from "./activation.ts";
import { isUsableMinimumVersionText, normalizePracticeQuantityFields } from "./practiceQuantity.ts";

export const REVIEW_DECISIONS = ["keep", "shrink", "swap", "pause", "advance"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export type NextWeekPlan = {
  action_label: string;
  cue: string;
  frequency_per_week: number;
  target_quantity: number | null;
  quantity_unit: string | null;
  minimum_quantity: number | null;
  minimum_quantity_unit: string | null;
  minimum_version: string;
};

const DAY_MS = 86_400_000;

export function reviewDueDate(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00.000Z`);
  return new Date(start.getTime() + 6 * DAY_MS).toISOString().slice(0, 10);
}

export function isReviewDue(weekStart: string, date: string): boolean {
  return date >= reviewDueDate(weekStart);
}

export function isReviewDecision(value: unknown): value is ReviewDecision {
  return typeof value === "string" && REVIEW_DECISIONS.includes(value as ReviewDecision);
}

export function suggestedNextPlan(
  experiment: Pick<WeeklyExperiment, "action_label" | "cue" | "frequency_per_week" | "target_quantity" | "quantity_unit" | "minimum_quantity" | "minimum_quantity_unit" | "minimum_version">,
  decision: ReviewDecision,
): NextWeekPlan | null {
  if (decision === "pause") return null;
  const frequency = experiment.frequency_per_week ?? 1;
  return {
    action_label: experiment.action_label ?? "",
    cue: experiment.cue ?? "",
    frequency_per_week: decision === "shrink" ? Math.max(1, frequency - 1) : decision === "advance" ? Math.min(7, frequency + 1) : frequency,
    target_quantity: experiment.target_quantity ?? null,
    quantity_unit: experiment.quantity_unit ?? null,
    minimum_quantity: experiment.minimum_quantity ?? null,
    minimum_quantity_unit: experiment.minimum_quantity_unit ?? null,
    minimum_version: experiment.minimum_version ?? "",
  };
}

export function validateNextPlan(value: unknown): NextWeekPlan | null {
  if (!value || typeof value !== "object") return null;
  const plan = value as Record<string, unknown>;
  const action = cleanText(plan.action_label, 240);
  const cue = cleanText(plan.cue, 160);
  const minimum = cleanText(plan.minimum_version, 160);
  const frequency = Number(plan.frequency_per_week);
  const quantity = normalizePracticeQuantityFields(plan);
  if (!isSafeLifestyleAction(action) || !cue || cue.length < 2 || !isSafeLifestyleAction(minimum) || !isUsableMinimumVersionText(minimum)) return null;
  if (!Number.isInteger(frequency) || frequency < 1 || frequency > 7) return null;
  if (!quantity.ok) return null;
  return { action_label: action, cue, frequency_per_week: frequency, ...quantity.value, minimum_version: minimum };
}
