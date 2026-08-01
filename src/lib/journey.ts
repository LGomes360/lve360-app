export type JourneyExperiment = {
  id: string;
  source_stack_id: string | null;
  source_action_id: string | null;
  identity_direction: string | null;
  action_label: string | null;
  cue: string | null;
  frequency_per_week: number | null;
  minimum_version: string | null;
  status: "draft" | "active" | "completed" | "archived";
  week_start: string;
  activated_at: string | null;
  completed_at: string | null;
};

export type JourneyReview = {
  experiment_id: string;
  next_experiment_id: string | null;
  completion_count: number;
  target_count: number;
  difficulty: number | null;
  value_rating: number | null;
  decision: "keep" | "shrink" | "swap" | "pause" | "advance" | null;
  status: "draft" | "completed";
  completed_at: string | null;
};

export type JourneyDomainSummary = {
  domain: string;
  weeks: number;
  repetitions: number;
  reviews: number;
  latest_decision: JourneyReview["decision"];
};

export type JourneyCompletion = {
  experiment_id: string;
  completion_date: string;
  completion_kind: "full" | "minimum";
};

export type JourneyCheckIn = {
  log_date: string;
  weight: number | null;
  sleep: number | null;
  energy: number | null;
};

export type JourneyResponse = {
  ok: boolean;
  experiments: JourneyExperiment[];
  reviews: JourneyReview[];
  completions: JourneyCompletion[];
  check_ins: JourneyCheckIn[];
  blueprint: import("@/lib/blueprintContext").CurrentBlueprintContext | null;
  experiment_blueprints: Record<string, import("@/lib/blueprintContext").ExperimentBlueprintContext>;
  error?: string;
};

export const DOMAIN_LABELS: Record<string, string> = {
  movement: "Movement",
  nutrition: "Nutrition",
  sleep: "Sleep",
  emotional_health: "Emotional health",
  relationships: "Relationships",
  focus: "Focus",
  career: "Career",
  happiness: "Happiness",
  overall_health: "Overall health",
};

export const DECISION_LABELS: Record<string, string> = {
  keep: "Kept the practice",
  shrink: "Made it smaller",
  swap: "Swapped the practice",
  pause: "Paused",
  advance: "Built on it",
};

export function domainLabel(value: string | null): string {
  return value ? DOMAIN_LABELS[value] ?? "Overall health" : "Overall health";
}

export function completionRate(completed: number, target: number): number {
  if (!Number.isFinite(completed) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.round((completed / target) * 100));
}

export function distinctWeeks(dates: string[]): number {
  return new Set(dates.map((date) => weekStart(date))).size;
}

export function weekStart(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - ((day + 6) % 7));
  return value.toISOString().slice(0, 10);
}

export function hasFourWeeksOfHistory(checkIns: JourneyCheckIn[], reviews: JourneyReview[]): boolean {
  const checkInWeeks = distinctWeeks(checkIns.map((item) => item.log_date));
  const reviewWeeks = distinctWeeks(
    reviews
      .map((item) => item.completed_at?.slice(0, 10) ?? "")
      .filter(Boolean),
  );
  return Math.max(checkInWeeks, reviewWeeks) >= 4;
}

export function measuredMetricsForDomain(domain: string | null): Array<"sleep" | "energy" | "weight"> {
  if (domain === "sleep") return ["sleep", "energy"];
  if (domain === "movement" || domain === "nutrition" || domain === "overall_health") {
    return ["energy", "weight", "sleep"];
  }
  if (domain === "focus" || domain === "career") return ["energy", "sleep"];
  return [];
}

export function journeyDomainSummaries(
  experiments: JourneyExperiment[],
  reviews: JourneyReview[],
  completions: JourneyCompletion[],
): JourneyDomainSummary[] {
  const reviewsByExperiment = new Map(reviews.map((review) => [review.experiment_id, review]));
  const completionsByExperiment = completions.reduce<Map<string, number>>((counts, completion) => {
    counts.set(completion.experiment_id, (counts.get(completion.experiment_id) ?? 0) + 1);
    return counts;
  }, new Map());

  const summaries = new Map<string, JourneyDomainSummary>();
  for (const experiment of experiments) {
    const domain = experiment.identity_direction ?? "overall_health";
    const review = reviewsByExperiment.get(experiment.id) ?? null;
    const existing = summaries.get(domain) ?? {
      domain,
      weeks: 0,
      repetitions: 0,
      reviews: 0,
      latest_decision: null,
    };
    existing.weeks += 1;
    existing.repetitions += completionsByExperiment.get(experiment.id) ?? 0;
    existing.reviews += review?.status === "completed" ? 1 : 0;
    if (!existing.latest_decision && review?.decision) existing.latest_decision = review.decision;
    summaries.set(domain, existing);
  }

  return [...summaries.values()].sort((a, b) => b.weeks - a.weeks || a.domain.localeCompare(b.domain));
}
