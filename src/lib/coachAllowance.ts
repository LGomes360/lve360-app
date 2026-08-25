export type CoachLimit = {
  monthlyTurns: number;
  monthlyCostUsd: number;
};

export type CoachUsageSummary = {
  turns: number;
  estimatedCostUsd: number;
  limit: CoachLimit;
  allowance: {
    baseTurns: number;
    bonusTurns: number;
    totalTurns: number;
  };
  period: {
    startAt: string;
    resetAt: string;
  };
  remaining: number;
  exhausted: boolean;
  limitedBy: "turns" | "cost" | null;
};

function wholeNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function positiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function coachPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    periodStart: start.toISOString().slice(0, 10),
    startAt: start.toISOString(),
    resetAt: reset.toISOString(),
  };
}

export function coachUsageSummary(input: {
  turns: number;
  estimatedCostUsd: number;
  bonusTurns?: number;
  limit: CoachLimit;
  now?: Date;
}): CoachUsageSummary {
  const period = coachPeriod(input.now);
  const turns = wholeNumber(input.turns);
  const baseTurns = wholeNumber(input.limit.monthlyTurns, 1);
  const bonusTurns = Math.min(100, wholeNumber(input.bonusTurns ?? 0));
  const totalTurns = baseTurns + bonusTurns;
  const monthlyCostUsd = positiveNumber(input.limit.monthlyCostUsd, 1.5);
  const estimatedCostUsd = Number.isFinite(input.estimatedCostUsd)
    ? Math.max(0, input.estimatedCostUsd)
    : 0;
  const costReached = estimatedCostUsd >= monthlyCostUsd;
  const turnsReached = turns >= totalTurns;
  const limitedBy = costReached ? "cost" : turnsReached ? "turns" : null;

  return {
    turns,
    estimatedCostUsd,
    limit: { monthlyTurns: baseTurns, monthlyCostUsd },
    allowance: { baseTurns, bonusTurns, totalTurns },
    period: { startAt: period.startAt, resetAt: period.resetAt },
    remaining: limitedBy ? 0 : Math.max(0, totalTurns - turns),
    exhausted: limitedBy !== null,
    limitedBy,
  };
}

export function coachResetLabel(resetAt: string, locale = "en-US") {
  const reset = new Date(resetAt);
  if (Number.isNaN(reset.getTime())) return "the start of next month";
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(reset);
}

export function coachLimitAnswer(usage: Pick<CoachUsageSummary, "period">) {
  return `You have used your Ask LVE360 allowance for this period. It resets on ${coachResetLabel(usage.period.resetAt)}. Until then, you can keep using Today, Routine, Journey, and your saved Blueprint. Contact support if you believe this limit is incorrect.`;
}
