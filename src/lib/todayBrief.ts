import { z } from "zod";

export const TODAY_BRIEF_PROMPT_VERSION = "today-brief-v3";

export type TodayBriefPrimaryAction =
  | "mark_complete"
  | "open_blueprint"
  | "open_review"
  | "none";

export type TodayBriefContext = {
  localDate: string;
  experiment: {
    id: string;
    identity: string;
    actionLabel: string;
    cue: string;
    minimumVersion: string;
    target: number;
    completed: number;
    completedToday: boolean;
  } | null;
  blueprint: {
    stackId: string;
    needsRefresh: boolean;
    safetyNeedsAttention: boolean;
    urgentSafetyInterruption?: boolean;
  } | null;
  reviewDue: boolean;
};

export type TodayBriefContent = {
  noticed: string;
  whyItMatters: string;
  nextAction: string;
  minimumVersion: string;
  primaryAction: TodayBriefPrimaryAction;
  primaryHref: string | null;
};

const GeneratedBriefSchema = z.object({
  noticed: z.string().trim().min(8).max(180),
  why_it_matters: z.string().trim().min(8).max(220),
}).strict();

const INTERVENTION_PATTERN = /\b(?:b[- ]?12|supplement|vitamin|mineral|magnesium|creatine|omega[- ]?3|fish oil|ashwagandha|melatonin|probiotic|medication|medicine|drug|dose|dosage|prescription|clinician|physician|doctor|pharmacist|blood test|lab(?:oratory)?|mg|mcg|iu|tablet|capsule)\b/i;
const MEDICAL_CLAIM_PATTERN = /\b(?:diagnos|treat|cure|prevent|reverse|manage)\w*\s+(?:a\s+|an\s+|your\s+)?(?:disease|condition|disorder|syndrome|symptom)/i;
const DISCOURAGING_PATTERN = /\b(?:despite|failed|failure|missed|behind|should have|haven't|have not)\b/i;

function safeGeneratedText(value: string) {
  return value.trim().length >= 2
    && !INTERVENTION_PATTERN.test(value)
    && !MEDICAL_CLAIM_PATTERN.test(value);
}

export function parseGeneratedTodayBrief(
  raw: string,
  context: TodayBriefContext,
): TodayBriefContent | null {
  const candidate = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  const result = GeneratedBriefSchema.safeParse(parsed);
  if (!result.success) return null;

  const text = result.data;
  if (
    !safeGeneratedText(text.noticed)
    || !safeGeneratedText(text.why_it_matters)
    || DISCOURAGING_PATTERN.test(text.noticed)
    || DISCOURAGING_PATTERN.test(text.why_it_matters)
  ) return null;

  const fallback = deterministicTodayBrief(context);
  return {
    noticed: text.noticed,
    whyItMatters: text.why_it_matters,
    nextAction: fallback.nextAction,
    minimumVersion: fallback.minimumVersion,
    primaryAction: fallback.primaryAction,
    primaryHref: fallback.primaryHref,
  };
}

export function shouldGenerateTodayBrief(context: TodayBriefContext): boolean {
  return Boolean(
    context.experiment
    && !context.experiment.completedToday
    && !context.reviewDue
    && !context.blueprint?.urgentSafetyInterruption,
  );
}

export function deterministicTodayBrief(context: TodayBriefContext): TodayBriefContent {
  if (context.blueprint?.urgentSafetyInterruption) {
    return {
      noticed: "LVE360 could not confirm the current Blueprint safety section.",
      whyItMatters: "Review the current source before using health-sensitive guidance.",
      nextAction: "Open your current Blueprint and review the safety section.",
      minimumVersion: "Open the Blueprint and read the first safety item.",
      primaryAction: "open_blueprint",
      primaryHref: `/blueprints/${context.blueprint.stackId}#safety-notes`,
    };
  }

  if (context.experiment && context.reviewDue) {
    return {
      noticed: "Your focused week is ready for a short review.",
      whyItMatters: "A quick reflection helps the next week fit your real life instead of repeating friction.",
      nextAction: "Review what worked, then keep, shrink, or change the practice.",
      minimumVersion: "Name one thing that made the practice easier or harder.",
      primaryAction: "open_review",
      primaryHref: `/review?experiment=${encodeURIComponent(context.experiment.id)}`,
    };
  }

  if (!context.experiment) {
    return {
      noticed: "You do not have an active weekly practice yet.",
      whyItMatters: "One specific practice gives LVE360 something useful to help you repeat.",
      nextAction: "Choose one small lifestyle practice for this week.",
      minimumVersion: "Pick the area of life you want to support first.",
      primaryAction: "none",
      primaryHref: "/onboarding",
    };
  }

  if (context.experiment.completedToday) {
    return {
      noticed: "You already recorded today’s focused practice.",
      whyItMatters: "A completed repetition is enough. Consistency grows when success stays achievable.",
      nextAction: "Let today’s win stand and return to the rest of your day.",
      minimumVersion: "Notice what helped you follow through.",
      primaryAction: "none",
      primaryHref: null,
    };
  }

  const remaining = Math.max(0, context.experiment.target - context.experiment.completed);
  return {
    noticed: remaining === 1
      ? "One more repetition will keep your promise for this week."
      : `You have completed ${context.experiment.completed} of ${context.experiment.target} planned repetitions this week.`,
    whyItMatters: `This is one vote for ${context.experiment.identity.toLowerCase()}.`,
    nextAction: context.experiment.actionLabel,
    minimumVersion: context.experiment.minimumVersion,
    primaryAction: "mark_complete",
    primaryHref: null,
  };
}
