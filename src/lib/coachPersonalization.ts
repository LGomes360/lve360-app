import type { CoachIntent, CoachSource } from "./contextualCoach";

export const EXCLUDABLE_COACH_CONTEXT_IDS = [
  "recent_check_ins",
  "goals",
  "preferences",
  "weekly_practice",
  "recent_coaching",
] as const;

export type ExcludableCoachContextId = (typeof EXCLUDABLE_COACH_CONTEXT_IDS)[number];

export type CoachPersonalizationReceipt = {
  whyNow: string;
  expectedSignal: string;
  reviewTiming: string;
  sourceIds: string[];
  noAutomaticChanges: true;
};

export function isExcludableCoachContextId(value: unknown): value is ExcludableCoachContextId {
  return typeof value === "string" && EXCLUDABLE_COACH_CONTEXT_IDS.includes(value as ExcludableCoachContextId);
}

function cleanSentence(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  return cleaned ? `${cleaned}.` : "";
}

function reviewPlanFromAnswer(answer: string) {
  const experiment = answer.match(/Experiment:\s*(?:(\d+) days|one change at a time)(?:;\s*track\s*([^\n.]+))?/i);
  const days = experiment?.[1] ? Number(experiment[1]) : null;
  const metrics = experiment?.[2]?.trim() || null;
  return {
    expectedSignal: metrics ? `Notice what changes in ${metrics}.` : null,
    reviewTiming: days ? `Review after ${days} days.` : null,
  };
}

export function buildCoachPersonalizationReceipt(input: {
  intent: CoachIntent;
  answer: string;
  sources: CoachSource[];
  actionProposal?: { actionLabel: string; rationale?: string | null } | null;
}): CoachPersonalizationReceipt | null {
  const memberSources = input.sources.filter((source) => (source.kind ?? "member_record") === "member_record");
  if (!memberSources.length || ["GENERAL_EDUCATION", "OUT_OF_SCOPE", "POTENTIAL_MEDICAL_RED_FLAG"].includes(input.intent)) {
    return null;
  }

  const priority = ["recent_check_ins", "weekly_practice", "goals", "current_plan", "current_blueprint", "current_routine", "preferences", "health_profile", "recent_coaching"];
  const anchor = [...memberSources].sort((left, right) => {
    const leftIndex = priority.indexOf(left.id);
    const rightIndex = priority.indexOf(right.id);
    return (leftIndex < 0 ? priority.length : leftIndex) - (rightIndex < 0 ? priority.length : rightIndex);
  })[0];
  const parsedReview = reviewPlanFromAnswer(input.answer);
  const renderedReason = input.answer.match(/Why this fits you:\s*([^\n]+)/i)?.[1] ?? null;
  const reason = input.actionProposal?.rationale || renderedReason;

  const expectedSignal = input.actionProposal
    ? `Notice whether ${input.actionProposal.actionLabel.toLowerCase()} feels workable and whether you complete it.`
    : parsedReview.expectedSignal
      ?? (memberSources.some((source) => source.id === "recent_check_ins")
        ? "Use your next check-in to notice whether this guidance still fits."
        : "Notice whether this next step feels useful and fits your saved plan.");
  const reviewTiming = input.actionProposal || memberSources.some((source) => source.id === "weekly_practice")
    ? "Review it at your next weekly review."
    : parsedReview.reviewTiming ?? "Review it after your next check-in.";

  return {
    whyNow: reason
      ? `${cleanSentence(reason).slice(0, 280)} Grounded in ${anchor.label.toLowerCase()}.`
      : `${anchor.label}: ${cleanSentence(anchor.summary)}`,
    expectedSignal,
    reviewTiming,
    sourceIds: memberSources.map((source) => source.id),
    noAutomaticChanges: true,
  };
}

export function attachCoachPersonalizationReceipt(
  sources: CoachSource[],
  receipt: CoachPersonalizationReceipt | null,
): CoachSource[] {
  if (!receipt || !sources.length) return sources;
  return sources.map((source, index) => index === 0 ? { ...source, personalization_receipt: receipt } : source);
}

export function coachPersonalizationFromSources(sources: CoachSource[]): CoachPersonalizationReceipt | null {
  const receipt = sources.find((source) => source.personalization_receipt)?.personalization_receipt;
  return receipt?.noAutomaticChanges === true ? receipt : null;
}
