function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function coachBudget() {
  const isPreview = process.env.VERCEL_ENV === "preview";

  return {
    monthlyTurns: Math.floor(positiveNumber(
      isPreview ? process.env.LVE_AI_COACH_PREVIEW_MONTHLY_TURNS : process.env.LVE_AI_COACH_MONTHLY_TURNS,
      isPreview ? 250 : 40,
    )),
    monthlyCostUsd: positiveNumber(
      isPreview ? process.env.LVE_AI_COACH_PREVIEW_MONTHLY_COST_USD : process.env.LVE_AI_COACH_MONTHLY_COST_USD,
      isPreview ? 10 : 1.5,
    ),
  };
}
