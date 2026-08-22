export type AdaptiveReviewDecision = "keep" | "shrink" | "swap" | "pause" | "advance";

export type AdaptiveHistoryWeek = {
  identityDirection: string | null;
  actionLabel: string;
  completionCount: number;
  target: number;
  difficulty: number;
  valueRating: number;
};

export type AdaptiveDecisionContext = {
  identityDirection: string | null;
  actionLabel: string | null;
  completedCount: number;
  target: number;
  difficulty: number;
  valueRating: number;
  checkInCount: number;
  history: AdaptiveHistoryWeek[];
};

function normalizedAction(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function comparableAdaptiveHistory<T extends AdaptiveHistoryWeek>(context: Omit<AdaptiveDecisionContext, "history"> & { history: T[] }): T[] {
  const currentAction = normalizedAction(context.actionLabel);
  return context.history.filter((week) => {
    if (context.identityDirection && week.identityDirection === context.identityDirection) return true;
    return Boolean(currentAction) && normalizedAction(week.actionLabel) === currentAction;
  });
}

export function samePracticeAdaptiveHistory<T extends AdaptiveHistoryWeek>(context: Omit<AdaptiveDecisionContext, "history"> & { history: T[] }): T[] {
  const currentAction = normalizedAction(context.actionLabel);
  if (!currentAction) return [];
  return context.history.filter((week) => normalizedAction(week.actionLabel) === currentAction);
}

export function isAdaptiveLowData(context: AdaptiveDecisionContext) {
  return context.completedCount < 2 && context.checkInCount < 2 && comparableAdaptiveHistory(context).length < 2;
}

export function recommendedAdaptiveReviewDecision(context: AdaptiveDecisionContext): AdaptiveReviewDecision {
  const completionRatio = context.target > 0 ? context.completedCount / context.target : 0;
  const recentComparable = comparableAdaptiveHistory(context).slice(0, 3);
  const repeatedLowValue = recentComparable.filter((week) => week.valueRating <= 2).length >= 2;
  const repeatedHighFriction = recentComparable.some((week) => week.difficulty >= 4);
  const recentSamePractice = samePracticeAdaptiveHistory(context).slice(0, 2);
  const sustainedSuccess = recentSamePractice.length === 2
    && recentSamePractice.every((week) => week.target > 0
      && week.completionCount / week.target >= 0.8
      && week.valueRating >= 4
      && week.difficulty <= 2);
  if (context.valueRating <= 2 && repeatedLowValue) return "pause";
  if (context.valueRating <= 2) return "swap";
  if ((context.difficulty >= 4 && repeatedHighFriction) || completionRatio < 0.6) return "shrink";
  if (completionRatio >= 0.8 && context.valueRating >= 4 && context.difficulty <= 2 && sustainedSuccess) return "advance";
  if (context.difficulty >= 4) return "shrink";
  if (completionRatio >= 1 && context.valueRating >= 4 && context.difficulty <= 2) return "advance";
  return "keep";
}
