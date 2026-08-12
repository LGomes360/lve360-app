function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function coachBudget() {
  return {
    monthlyTurns: Math.floor(positiveNumber(process.env.LVE_AI_COACH_MONTHLY_TURNS, 40)),
    monthlyCostUsd: positiveNumber(process.env.LVE_AI_COACH_MONTHLY_COST_USD, 1.5),
  };
}
