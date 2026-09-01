import { cleanText, isSafeLifestyleAction, type WeeklyExperiment } from "./activation.ts";
import { isUsableMinimumVersionText, normalizePracticeQuantityFields } from "./practiceQuantity.ts";

export const REVIEW_DECISIONS = ["keep", "shrink", "swap", "pause", "advance"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const PRACTICE_ADAPTATIONS = [
  "continue",
  "decrease",
  "increase",
  "modify",
  "pause",
  "replace",
  "graduate",
] as const;
export type PracticeAdaptation = (typeof PRACTICE_ADAPTATIONS)[number];

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

export function isPracticeAdaptation(value: unknown): value is PracticeAdaptation {
  return typeof value === "string" && PRACTICE_ADAPTATIONS.includes(value as PracticeAdaptation);
}

export function adaptationForReviewDecision(decision: ReviewDecision): PracticeAdaptation {
  if (decision === "shrink") return "decrease";
  if (decision === "advance") return "increase";
  if (decision === "swap") return "replace";
  if (decision === "pause") return "pause";
  return "continue";
}

export function reviewDecisionForAdaptation(adaptation: PracticeAdaptation): ReviewDecision {
  if (adaptation === "decrease") return "shrink";
  if (adaptation === "increase") return "advance";
  if (adaptation === "replace") return "swap";
  if (adaptation === "pause" || adaptation === "graduate") return "pause";
  return "keep";
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

export function suggestedAdaptationPlan(
  experiment: Pick<WeeklyExperiment, "action_label" | "cue" | "frequency_per_week" | "target_quantity" | "quantity_unit" | "minimum_quantity" | "minimum_quantity_unit" | "minimum_version">,
  adaptation: PracticeAdaptation,
): NextWeekPlan | null {
  if (adaptation === "pause" || adaptation === "graduate") return null;
  const legacyDecision = reviewDecisionForAdaptation(adaptation);
  const plan = suggestedNextPlan(experiment, legacyDecision);
  if (!plan) return null;
  return adaptation === "replace" ? { ...plan, action_label: "" } : plan;
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

export function cleanAdaptationRationale(value: unknown): string | null {
  const rationale = cleanText(value, 500);
  return rationale && rationale.length >= 3 ? rationale : null;
}

export function validateAdaptationPlan(
  experiment: Pick<WeeklyExperiment, "action_label" | "cue" | "frequency_per_week" | "target_quantity" | "quantity_unit" | "minimum_quantity" | "minimum_quantity_unit" | "minimum_version">,
  adaptation: PracticeAdaptation,
  value: unknown,
): NextWeekPlan | null {
  if (adaptation === "pause" || adaptation === "graduate") return null;
  const plan = validateNextPlan(value);
  const current = validateNextPlan({
    action_label: experiment.action_label,
    cue: experiment.cue,
    frequency_per_week: experiment.frequency_per_week,
    target_quantity: experiment.target_quantity,
    quantity_unit: experiment.quantity_unit,
    minimum_quantity: experiment.minimum_quantity,
    minimum_quantity_unit: experiment.minimum_quantity_unit,
    minimum_version: experiment.minimum_version,
  });
  if (!plan || !current) return null;

  const same = samePlan(plan, current);
  if (adaptation === "continue") return same ? plan : null;
  if (adaptation === "replace") {
    return plan.action_label.toLowerCase() !== current.action_label.toLowerCase() ? plan : null;
  }
  if (adaptation === "modify") return same ? null : plan;

  const sameTargetUnit = normalizedUnit(plan.quantity_unit) === normalizedUnit(current.quantity_unit);
  const targetDelta = sameTargetUnit && plan.target_quantity != null && current.target_quantity != null
    ? plan.target_quantity - current.target_quantity
    : 0;
  if (adaptation === "decrease") {
    return plan.frequency_per_week < current.frequency_per_week || targetDelta < 0 ? plan : null;
  }
  return plan.frequency_per_week > current.frequency_per_week || targetDelta > 0 ? plan : null;
}

function samePlan(left: NextWeekPlan, right: NextWeekPlan): boolean {
  return left.action_label === right.action_label
    && left.cue === right.cue
    && left.frequency_per_week === right.frequency_per_week
    && left.target_quantity === right.target_quantity
    && normalizedUnit(left.quantity_unit) === normalizedUnit(right.quantity_unit)
    && left.minimum_quantity === right.minimum_quantity
    && normalizedUnit(left.minimum_quantity_unit) === normalizedUnit(right.minimum_quantity_unit)
    && left.minimum_version === right.minimum_version;
}

function normalizedUnit(value: string | null): string | null {
  return value?.trim().toLowerCase() || null;
}
