import { z } from "zod";

import { STARTER_ACTIONS, type IdentityDirection, type WeeklyExperiment } from "./activation";
import { suggestedNextPlan, type NextWeekPlan, type ReviewDecision } from "./weeklyReview";
import { comparableAdaptiveHistory, isAdaptiveLowData, recommendedAdaptiveReviewDecision } from "./weeklySynthesisDecision";
import { hypothesisSupportsDecision, normalizeMemberVoice, usesDirectMemberVoice } from "./weeklySynthesisLanguage";
import {
  buildWeeklyPracticeMetrics,
  formatPracticeQuantity,
  practiceCompletionSummary,
  type PracticeCompletionQuantity,
  type WeeklyPracticeMetrics,
} from "./practiceQuantity.ts";

export const WEEKLY_SYNTHESIS_PROMPT_VERSION = "weekly-review-synthesis-v7";

export const WEEKLY_SYNTHESIS_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  name: "lve360_weekly_reflection",
  description: "A factual observation and a cautious hypothesis for one weekly lifestyle-practice review.",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      observation: {
        type: "string",
        minLength: 12,
        maxLength: 220,
        description: "A neutral fact statement that begins with You and addresses the person directly.",
      },
      hypothesis: {
        type: "string",
        minLength: 12,
        maxLength: 280,
        description: "A cautious possibility that uses your and supports the supplied deterministic recommendation.",
      },
    },
    required: ["observation", "hypothesis"],
  },
};

export type WeeklySynthesisEvidence = {
  label: string;
  value: string;
};

export type WeeklySynthesisHistoryWeek = {
  experimentId: string;
  weekStart: string;
  identityDirection: WeeklyExperiment["identity_direction"];
  actionLabel: string;
  completionCount: number;
  target: number;
  difficulty: number;
  valueRating: number;
  decision: ReviewDecision;
};

export type WeeklySynthesisContext = {
  experiment: Pick<WeeklyExperiment, "id" | "identity_direction" | "action_label" | "cue" | "frequency_per_week" | "target_quantity" | "quantity_unit" | "minimum_quantity" | "minimum_quantity_unit" | "minimum_version" | "week_start">;
  completedDates: string[];
  completions?: PracticeCompletionQuantity[];
  completedCount: number;
  target: number;
  difficulty: number;
  valueRating: number;
  checkIns: Array<{ date: string; sleep: number | null; energy: number | null }>;
  history: WeeklySynthesisHistoryWeek[];
};

export type WeeklySynthesisContent = {
  observation: string;
  hypothesis: string;
  evidence: WeeklySynthesisEvidence[];
  confidence: "low" | "moderate";
  suggestedDecision: ReviewDecision;
  suggestedPlan: NextWeekPlan | null;
};

export type WeeklySynthesis = WeeklySynthesisContent & {
  id: string;
  historyWeeks: number;
  source: "ai" | "fallback";
  generationStatus: "pending" | "succeeded" | "failed" | "skipped";
  responseState: "none" | "accepted" | "edited" | "rejected";
};

const GeneratedSynthesisSchema = z.object({
  observation: z.string().trim().min(12).max(220),
  hypothesis: z.string().trim().min(12).max(280),
}).strict();

const INTERVENTION_PATTERN = /\b(?:b[- ]?12|supplement|vitamin|mineral|magnesium|creatine|omega[- ]?3|fish oil|medication|medicine|drug|dose|dosage|prescription|clinician|physician|doctor|pharmacist|blood test|lab(?:oratory)?|mg|mcg|iu|tablet|capsule)\b/i;
const MEDICAL_CLAIM_PATTERN = /\b(?:diagnos|treat|cure|prevent|reverse|manage)\w*\s+(?:a\s+|an\s+|your\s+)?(?:disease|condition|disorder|syndrome|symptom)/i;
const DISCOURAGING_PATTERN = /\b(?:failed|failure|lazy|behind|should have|haven't|have not)\b/i;
const FREQUENCY_AS_QUANTITY_PATTERN = /\b(?:planned|completed|practice)\s+(?:repetitions?|reps)\b/i;

function safeGeneratedText(value: string) {
  return !INTERVENTION_PATTERN.test(value)
    && !MEDICAL_CLAIM_PATTERN.test(value)
    && !DISCOURAGING_PATTERN.test(value)
    && !FREQUENCY_AS_QUANTITY_PATTERN.test(value);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function decisionContext(context: WeeklySynthesisContext) {
  return {
    identityDirection: context.experiment.identity_direction,
    actionLabel: context.experiment.action_label,
    completedCount: context.completedCount,
    target: context.target,
    difficulty: context.difficulty,
    valueRating: context.valueRating,
    checkInCount: context.checkIns.length,
    history: context.history,
  };
}

export function comparableHistory(context: WeeklySynthesisContext) {
  return comparableAdaptiveHistory(decisionContext(context));
}

export function isLowDataWeek(context: WeeklySynthesisContext) {
  return isAdaptiveLowData(decisionContext(context));
}

export function recommendedReviewDecision(context: WeeklySynthesisContext): ReviewDecision {
  return recommendedAdaptiveReviewDecision(decisionContext(context));
}

export function recommendedNextPlan(context: WeeklySynthesisContext, decision: ReviewDecision): NextWeekPlan | null {
  if (decision !== "swap") return suggestedNextPlan(context.experiment, decision);

  const domain = context.experiment.identity_direction ?? "overall_health";
  const options = STARTER_ACTIONS[domain as IdentityDirection] ?? STARTER_ACTIONS.overall_health;
  const current = context.experiment.action_label?.trim().toLowerCase() ?? "";
  const replacement = options.find((option) => option.toLowerCase() !== current) ?? options[0];
  return {
    action_label: replacement,
    cue: context.experiment.cue ?? "After a routine I already do",
    frequency_per_week: Math.max(1, Math.min(3, context.target)),
    target_quantity: null,
    quantity_unit: null,
    minimum_quantity: null,
    minimum_quantity_unit: null,
    minimum_version: context.experiment.minimum_version ?? "Take the first small step",
  };
}

export function deterministicPracticeMetrics(context: WeeklySynthesisContext): WeeklyPracticeMetrics {
  const completions = context.completions ?? context.completedDates.map((date) => ({
    completion_date: date,
    completion_kind: "full" as const,
    completed_quantity: null,
    quantity_unit: null,
  }));
  return buildWeeklyPracticeMetrics({
    practice: context.experiment.action_label,
    targetQuantity: context.experiment.target_quantity,
    quantityUnit: context.experiment.quantity_unit,
    minimumQuantity: context.experiment.minimum_quantity,
    minimumQuantityUnit: context.experiment.minimum_quantity_unit,
    plannedSessions: context.target,
    completions,
  });
}

export function weeklySynthesisEvidence(context: WeeklySynthesisContext): WeeklySynthesisEvidence[] {
  const metrics = deterministicPracticeMetrics(context);
  const evidence: WeeklySynthesisEvidence[] = [
    { label: "Practice completions", value: `${metrics.completed_sessions} of ${metrics.planned_sessions} planned` },
    { label: "Difficulty reflection", value: `${context.difficulty} of 5` },
    { label: "Usefulness reflection", value: `${context.valueRating} of 5` },
  ];
  if (metrics.known_total_quantity != null && metrics.total_quantity_unit) {
    evidence.splice(1, 0, { label: "Exercise volume", value: formatPracticeQuantity(metrics.known_total_quantity, metrics.total_quantity_unit) });
  }
  if (context.checkIns.length) {
    evidence.push({ label: "Daily check-ins", value: `${context.checkIns.length} recorded` });
    const sleep = average(context.checkIns.flatMap((item) => typeof item.sleep === "number" ? [item.sleep] : []));
    const energy = average(context.checkIns.flatMap((item) => typeof item.energy === "number" ? [item.energy] : []));
    if (sleep != null) evidence.push({ label: "Average sleep check-in", value: `${sleep.toFixed(1)} of 5` });
    if (energy != null) evidence.push({ label: "Average energy check-in", value: `${energy.toFixed(1)} of 10` });
  }
  if (context.history.length) {
    const comparable = comparableHistory(context);
    evidence.push({ label: "History considered", value: `${context.history.length} prior completed ${context.history.length === 1 ? "week" : "weeks"}` });
    evidence.push({ label: "Comparable focus history", value: `${comparable.length} ${comparable.length === 1 ? "week" : "weeks"}` });
    if (comparable.length) {
      const chronological = [...comparable].sort((left, right) => left.weekStart.localeCompare(right.weekStart));
      evidence.push({
        label: "Comparable completion trend",
        value: [...chronological.slice(-3).map((week) => `${week.completionCount}/${week.target}`), `${context.completedCount}/${context.target}`].join(" → "),
      });
      evidence.push({
        label: "Comparable usefulness trend",
        value: [...chronological.slice(-3).map((week) => `${week.valueRating}/5`), `${context.valueRating}/5`].join(" → "),
      });
    }
  } else {
    evidence.push({ label: "History considered", value: "No prior completed weekly reviews yet" });
  }
  return evidence;
}

export function deterministicWeeklySynthesis(context: WeeklySynthesisContext): WeeklySynthesisContent {
  const decision = recommendedReviewDecision(context);
  const early = isLowDataWeek(context);
  const metrics = deterministicPracticeMetrics(context);
  const volume = metrics.known_total_quantity != null && metrics.total_quantity_unit
    ? `, totaling ${formatPracticeQuantity(metrics.known_total_quantity, metrics.total_quantity_unit)}`
    : "";
  const observation = early
    ? `You have an early signal from ${metrics.completed_sessions} recorded practice ${metrics.completed_sessions === 1 ? "completion" : "completions"}${volume} and ${context.checkIns.length} daily ${context.checkIns.length === 1 ? "check-in" : "check-ins"}.`
    : `${practiceCompletionSummary(metrics).slice(0, -1)}, and rated it ${context.valueRating} of 5 for usefulness and ${context.difficulty} of 5 for difficulty.${context.history.length ? ` This reflection also considered ${context.history.length} prior completed ${context.history.length === 1 ? "week" : "weeks"}.` : ""}`;
  const hypotheses: Record<ReviewDecision, string> = {
    keep: "Your current version may be a workable fit. Repeating it for another week would test whether that fit is consistent.",
    shrink: "Your practice may still be worthwhile, but its current size, timing, or setup may be creating friction. A smaller version would test that idea.",
    swap: "Your practice may not feel useful enough to earn another week. A different small action in the same life area may be more informative.",
    pause: "Your repeated low-usefulness signal may mean this focus has not earned another immediate experiment. A pause would test whether a different priority deserves your attention next.",
    advance: "Your practice felt useful and repeatable this week. A very small increase would test whether it can grow without becoming burdensome.",
  };
  return {
    observation,
    hypothesis: hypotheses[decision],
    evidence: weeklySynthesisEvidence(context),
    confidence: early ? "low" : "moderate",
    suggestedDecision: decision,
    suggestedPlan: recommendedNextPlan(context, decision),
  };
}

export function parseGeneratedWeeklySynthesis(raw: string, context: WeeklySynthesisContext): WeeklySynthesisContent | null {
  const candidate = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  const result = GeneratedSynthesisSchema.safeParse(parsed);
  if (!result.success) return null;
  const observation = normalizeMemberVoice(result.data.observation, "observation");
  const hypothesis = normalizeMemberVoice(result.data.hypothesis, "hypothesis");
  if (!safeGeneratedText(observation) || !safeGeneratedText(hypothesis)) return null;
  const fallback = deterministicWeeklySynthesis(context);
  if (!usesDirectMemberVoice(observation, hypothesis)) return null;
  if (!hypothesisSupportsDecision(hypothesis, fallback.suggestedDecision)) return null;
  return {
    ...fallback,
    observation,
    hypothesis,
  };
}

function samePlan(left: NextWeekPlan | null, right: NextWeekPlan | null) {
  if (!left || !right) return left === right;
  return left.action_label.trim() === right.action_label.trim()
    && left.cue.trim() === right.cue.trim()
    && left.frequency_per_week === right.frequency_per_week
    && left.target_quantity === right.target_quantity
    && left.quantity_unit === right.quantity_unit
    && left.minimum_quantity === right.minimum_quantity
    && left.minimum_quantity_unit === right.minimum_quantity_unit
    && left.minimum_version.trim() === right.minimum_version.trim();
}

export function synthesisResponseState(
  synthesis: Pick<WeeklySynthesisContent, "suggestedDecision" | "suggestedPlan">,
  decision: ReviewDecision,
  plan: NextWeekPlan | null,
): "accepted" | "edited" | "rejected" {
  if (decision !== synthesis.suggestedDecision) return "rejected";
  return samePlan(plan, synthesis.suggestedPlan) ? "accepted" : "edited";
}
