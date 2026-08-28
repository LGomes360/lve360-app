import { z } from "zod";

export const TODAY_BRIEF_PROMPT_VERSION = "today-brief-v8";

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
    connectionSummary: string;
    connection?: {
      type: "goal" | "blueprint" | "both" | "independent";
      goal: {
        label: string | null;
        status: "current" | "historical" | "unresolved";
      } | null;
      blueprint: {
        label: string | null;
        status: "current" | "historical" | "unresolved";
      } | null;
    };
  } | null;
  blueprint: {
    stackId: string;
    needsRefresh: boolean;
    safetyNeedsAttention: boolean;
    urgentSafetyInterruption?: boolean;
  } | null;
  checkIn: {
    sleep: number | null;
    energy: number | null;
    weightRecorded: boolean;
    memberReportedContext: string | null;
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

export type TodayBriefGrounding = {
  confidence: "direct_record" | "limited_context";
  confidenceLabel: "Direct record match" | "Limited personal context";
  sourceLabel: string;
};

export type TodayRecommendationSource = {
  kind: "weekly_practice" | "check_in" | "saved_goal" | "blueprint" | "safety";
  label: string;
  detail: string;
  href: string;
  status?: "current" | "historical" | "needs_review";
};

export type TodayRecommendationGrounding = {
  title: "Why LVE360 chose this today";
  summary: string;
  sources: TodayRecommendationSource[];
  methodNote: string;
  confidence: TodayBriefGrounding["confidence"];
  confidenceLabel: TodayBriefGrounding["confidenceLabel"];
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
    noticed: fallback.noticed,
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
    && !isLowerCapacityCheckIn(context.checkIn)
    && !context.blueprint?.urgentSafetyInterruption,
  );
}

export function isLowerCapacityCheckIn(checkIn: TodayBriefContext["checkIn"]): boolean {
  return Boolean(
    checkIn
    && ((checkIn.sleep != null && checkIn.sleep <= 2) || (checkIn.energy != null && checkIn.energy <= 3)),
  );
}

export function todayBriefGrounding(
  context: TodayBriefContext,
  source: "ai" | "fallback",
): TodayBriefGrounding {
  if (context.blueprint?.urgentSafetyInterruption) {
    return {
      confidence: "direct_record",
      confidenceLabel: "Direct record match",
      sourceLabel: "Current Blueprint safety status",
    };
  }

  if (context.experiment && context.reviewDue) {
    return {
      confidence: "direct_record",
      confidenceLabel: "Direct record match",
      sourceLabel: "Saved weekly plan and review date",
    };
  }

  if (context.checkIn) {
    const includesReportedContext = Boolean(context.checkIn.memberReportedContext);
    return {
      confidence: "direct_record",
      confidenceLabel: "Direct record match",
      sourceLabel: source === "ai"
        ? `Today's check-in${includesReportedContext ? ", member-reported context" : ""}, saved practice, recorded progress, and bounded AI synthesis`
        : `Today's check-in${includesReportedContext ? ", member-reported context" : ""}, saved practice, and recorded progress`,
    };
  }

  const connection = context.experiment?.connectionSummary.trim() ?? "";
  const hasPersonalLink = Boolean(
    connection
    && !/^independently chosen/i.test(connection)
    && !/needs review|unresolved/i.test(connection),
  );
  return {
    confidence: hasPersonalLink ? "direct_record" : "limited_context",
    confidenceLabel: hasPersonalLink ? "Direct record match" : "Limited personal context",
    sourceLabel: source === "ai"
      ? "Saved practice, recorded progress, and bounded AI synthesis"
      : "Saved practice and recorded progress",
  };
}

function connectionStatus(status: "current" | "historical" | "unresolved") {
  return status === "unresolved" ? "needs_review" as const : status;
}

function checkInDetail(checkIn: NonNullable<TodayBriefContext["checkIn"]>) {
  const facts = [
    checkIn.sleep == null ? null : `sleep quality ${checkIn.sleep}/5`,
    checkIn.energy == null ? null : `energy ${checkIn.energy}/10`,
    checkIn.weightRecorded ? "weight recorded" : null,
    checkIn.memberReportedContext ? "optional reflection available" : null,
  ].filter((item): item is string => Boolean(item));
  return facts.length ? `Today: ${facts.join(" · ")}.` : "A check-in is saved for today.";
}

/**
 * Turns the exact context already used by Today into visible provenance. This
 * does not retrieve new data, call a model, or change the saved recommendation.
 */
export function todayRecommendationGrounding(
  context: TodayBriefContext,
  source: "ai" | "fallback",
): TodayRecommendationGrounding {
  const sources: TodayRecommendationSource[] = [];
  const experiment = context.experiment;
  const confidence = todayBriefGrounding(context, source);

  if (experiment) {
    const progress = `${experiment.completed} of ${experiment.target} planned ${experiment.target === 1 ? "session" : "sessions"} recorded${experiment.completedToday ? ", including today" : ""}`;
    sources.push({
      kind: "weekly_practice",
      label: "Saved weekly practice",
      detail: `${experiment.actionLabel} · ${progress}.`,
      href: "/journey",
      status: "current",
    });

    if (experiment.connection?.goal) {
      const goal = experiment.connection.goal;
      sources.push({
        kind: "saved_goal",
        label: goal.label ? "Saved goal" : "Saved goal connection",
        detail: goal.label ?? "The saved goal connection needs review.",
        href: "/onboarding",
        status: connectionStatus(goal.status),
      });
    }

    if (experiment.connection?.blueprint) {
      const blueprint = experiment.connection.blueprint;
      sources.push({
        kind: "blueprint",
        label: blueprint.label ? "Blueprint priority" : "Blueprint connection",
        detail: blueprint.label ?? "The saved Blueprint connection needs review.",
        href: context.blueprint ? `/blueprints/${context.blueprint.stackId}` : "/blueprints",
        status: connectionStatus(blueprint.status),
      });
    }

    if (!experiment.connection && !/^independently chosen/i.test(experiment.connectionSummary)) {
      sources.push({
        kind: "saved_goal",
        label: "Saved practice connection",
        detail: experiment.connectionSummary,
        href: "/onboarding",
        status: "current",
      });
    }
  }

  if (context.checkIn) {
    sources.push({
      kind: "check_in",
      label: "Today’s check-in",
      detail: checkInDetail(context.checkIn),
      href: "/today#daily-log",
      status: "current",
    });
  }

  if (context.blueprint?.urgentSafetyInterruption) {
    sources.unshift({
      kind: "safety",
      label: "Current Blueprint safety status",
      detail: "LVE360 could not confirm the current safety section, so this status temporarily outranked lifestyle coaching.",
      href: `/blueprints/${context.blueprint.stackId}#safety-notes`,
      status: "needs_review",
    });
  }

  let summary = "Your saved weekly plan remains the action. Recorded progress determines what is useful today.";
  if (context.blueprint?.urgentSafetyInterruption) {
    summary = "A current Blueprint safety status temporarily replaced the normal lifestyle recommendation.";
  } else if (experiment && context.reviewDue) {
    summary = "Your saved week reached its review point, so reflection now creates more value than another completion.";
  } else if (experiment?.completedToday) {
    summary = "Today’s completion is already saved, so LVE360 is protecting the win instead of adding another task.";
  } else if (isLowerCapacityCheckIn(context.checkIn) && experiment) {
    summary = "Today’s check-in selected your saved minimum version. It did not change your weekly practice.";
  } else if (!experiment) {
    summary = "No active weekly practice is saved, so LVE360 is asking for one clear focus before offering more advice.";
  } else if (context.checkIn) {
    summary = "Your saved practice remains the action. Today’s check-in and recorded progress shaped why it matters now.";
  }

  return {
    title: "Why LVE360 chose this today",
    summary,
    sources,
    methodNote: source === "ai"
      ? "AI only shaped the short explanation. Saved records selected the action and remain unchanged."
      : "This recommendation came directly from saved records. No AI interpretation was required.",
    confidence: confidence.confidence,
    confidenceLabel: confidence.confidenceLabel,
  };
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
      whyItMatters: "A completed session is enough. Consistency grows when success stays achievable.",
      nextAction: "Let today’s win stand and return to the rest of your day.",
      minimumVersion: "Notice what helped you follow through.",
      primaryAction: "none",
      primaryHref: null,
    };
  }

  if (isLowerCapacityCheckIn(context.checkIn)) {
    const lowSleep = context.checkIn?.sleep != null && context.checkIn.sleep <= 2;
    const lowEnergy = context.checkIn?.energy != null && context.checkIn.energy <= 3;
    const observedState = lowSleep && lowEnergy
      ? "lower sleep quality and energy"
      : lowSleep
        ? "lower sleep quality"
        : "lower energy";
    return {
      noticed: `You recorded ${observedState} today.`,
      whyItMatters: "A smaller version can protect follow-through without asking you to force the full effort.",
      nextAction: context.experiment.minimumVersion,
      minimumVersion: context.experiment.minimumVersion,
      primaryAction: "mark_complete",
      primaryHref: null,
    };
  }

  const remaining = Math.max(0, context.experiment.target - context.experiment.completed);
  return {
    noticed: remaining === 1
      ? "One more practice completion will keep your promise for this week."
      : `You have completed your practice ${context.experiment.completed} of ${context.experiment.target} planned times this week.`,
    whyItMatters: remaining === 1
      ? "This is the smallest useful step that closes your saved weekly plan without adding another goal."
      : "This keeps your saved weekly practice moving without adding another goal today.",
    nextAction: context.experiment.actionLabel,
    minimumVersion: context.experiment.minimumVersion,
    primaryAction: "mark_complete",
    primaryHref: null,
  };
}
