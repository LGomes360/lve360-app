export const RECOMMENDATION_DECISION_STATUSES = [
  "review",
  "clinician_review",
  "deferred",
  "dismissed",
  "adopted",
] as const;

export type RecommendationDecisionStatus = (typeof RECOMMENDATION_DECISION_STATUSES)[number];
export type MemberRecommendationDecision = Exclude<RecommendationDecisionStatus, "adopted">;

export type RecommendationDecisionRecord = {
  id: string;
  stack_id: string;
  stack_item_id: string;
  recommendation_key: string;
  context_fingerprint: string;
  status: RecommendationDecisionStatus;
  reason_snapshot: string;
  overlap_snapshot: string[];
  deferred_until: string | null;
  created_at: string;
  updated_at: string;
};

export type RecommendationProposalInput = {
  id: string;
  stack_id: string;
  name: string;
  rationale: string | null;
  notes: string | null;
};

export type RecommendationContextItem = {
  name: string;
};

export type RecommendationDecisionSeed = {
  stack_id: string;
  stack_item_id: string;
  recommendation_key: string;
  context_fingerprint: string;
  reason_snapshot: string;
  overlap_snapshot: string[];
};

const OVERLAP_FAMILIES: Array<{ recommendation: RegExp; current: RegExp }> = [
  {
    recommendation: /^(?:vitamin )?b12|methylcobalamin|cyanocobalamin/,
    current: /(?:vitamin )?b12|methylcobalamin|cyanocobalamin|b[- ]?complex|methyl protect|multivitamin/,
  },
  { recommendation: /^vitamin d|cholecalciferol/, current: /vitamin d|cholecalciferol|multivitamin/ },
  { recommendation: /^magnesium/, current: /magnesium/ },
  { recommendation: /omega[- ]?3|fish oil/, current: /omega[- ]?3|fish oil/ },
  { recommendation: /coq10|coenzyme q10/, current: /coq10|coenzyme q10/ },
];

const GOAL_MATCHERS: Array<{ signal: RegExp; goal: RegExp }> = [
  { signal: /energy|fatigue|b12|mitochond|carnitine/, goal: /energy|cognitive/ },
  { signal: /sleep|bedtime|glycine|magnesium|theanine|melatonin/, goal: /sleep/ },
  { signal: /muscle|strength|recovery|creatine|protein|collagen/, goal: /muscle|strength/ },
  { signal: /inflamm|joint|curcumin|omega/, goal: /inflamm|joint/ },
  { signal: /weight|metabolic|glucose|fiber/, goal: /weight|metabolic/ },
  { signal: /skin|hair|nail|collagen/, goal: /skin|hair|nail/ },
  { signal: /longevity|healthy aging|resilience/, goal: /longevity/ },
];

export function normalizeRecommendationName(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isRecommendationDecisionStatus(value: unknown): value is RecommendationDecisionStatus {
  return typeof value === "string" && RECOMMENDATION_DECISION_STATUSES.includes(value as RecommendationDecisionStatus);
}

export function isMemberRecommendationDecision(value: unknown): value is MemberRecommendationDecision {
  return isRecommendationDecisionStatus(value) && value !== "adopted";
}

export function isActionableRecommendationStatus(status: RecommendationDecisionStatus | null | undefined): boolean {
  return status === "review" || status === "clinician_review";
}

export function recommendationNeedsClinicianReview(notes: string | null | undefined): boolean {
  return /clinician review|pharmacist|interaction|contraindicat|use caution|avoid/i.test(notes ?? "");
}

export function extractBlueprintGoalNames(goalsMarkdown: string): string[] {
  const rows = String(goalsMarkdown ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|\s*-+/.test(line));
  if (rows.length < 2) return [];
  const seen = new Set<string>();
  const goals: string[] = [];
  for (const row of rows.slice(1)) {
    const goal = row.split("|").map((cell) => cell.trim())[1]?.replace(/[*_`]/g, "").trim();
    const key = normalizeRecommendationName(goal ?? "");
    if (!goal || !key || seen.has(key)) continue;
    seen.add(key);
    goals.push(goal);
  }
  return goals;
}

export function recommendationOverlapNames(
  recommendationName: string,
  currentItems: RecommendationContextItem[],
): string[] {
  const recommendation = normalizeRecommendationName(recommendationName);
  const family = OVERLAP_FAMILIES.find((candidate) => candidate.recommendation.test(recommendation));
  const overlaps = currentItems.filter((item) => {
    const current = normalizeRecommendationName(item.name);
    if (!current) return false;
    if (current === recommendation || current.includes(recommendation) || recommendation.includes(current)) return true;
    return family?.current.test(current) ?? false;
  });
  return [...new Set(overlaps.map((item) => item.name.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function alignedGoals(name: string, rationale: string | null, goals: string[]): string[] {
  const signal = normalizeRecommendationName(`${name} ${rationale ?? ""}`);
  const matching = goals.filter((goal) =>
    GOAL_MATCHERS.some((matcher) => matcher.signal.test(signal) && matcher.goal.test(normalizeRecommendationName(goal)))
  );
  return matching.length ? matching.slice(0, 3) : goals.slice(0, 2);
}

export function recommendationPersonalReason(
  proposal: Pick<RecommendationProposalInput, "name" | "rationale">,
  currentItems: RecommendationContextItem[],
  goals: string[],
): string {
  const normalizedName = normalizeRecommendationName(proposal.name);
  const currentNames = currentItems.map((item) => normalizeRecommendationName(item.name));
  const goalsForRecommendation = alignedGoals(proposal.name, proposal.rationale, goals);
  const goalText = goalsForRecommendation.length
    ? ` It also aligns with your recorded ${goalsForRecommendation.join(" and ")} priorities.`
    : "";

  if (/^(?:vitamin )?b12|methylcobalamin|cyanocobalamin/.test(normalizedName) && currentNames.includes("metformin")) {
    return `This appeared because your current record includes Metformin, which the Blueprint treats as a reason to review B12 status.${goalText} This is not a finding that you are deficient.`;
  }

  const rationale = proposal.rationale?.trim();
  if (rationale) {
    return `This appeared because your Blueprint connected it to your reported goals and health context.${goalText} Report rationale: ${rationale}`;
  }
  return `This appeared because your Blueprint connected it to your reported goals and current health context.${goalText}`;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function buildRecommendationDecisionSeed(
  proposal: RecommendationProposalInput,
  currentItems: RecommendationContextItem[],
  goals: string[],
): RecommendationDecisionSeed {
  const recommendationKey = normalizeRecommendationName(proposal.name);
  const overlapNames = recommendationOverlapNames(proposal.name, currentItems);
  const reason = recommendationPersonalReason(proposal, currentItems, goals);
  const context = JSON.stringify({
    recommendationKey,
    reason,
    overlapNames: overlapNames.map(normalizeRecommendationName),
    currentItems: currentItems.map((item) => normalizeRecommendationName(item.name)).filter(Boolean).sort(),
    goals: goals.map(normalizeRecommendationName).filter(Boolean).sort(),
    notes: proposal.notes?.trim() ?? "",
  });
  return {
    stack_id: proposal.stack_id,
    stack_item_id: proposal.id,
    recommendation_key: recommendationKey,
    context_fingerprint: `pr85:${hash(context)}`,
    reason_snapshot: reason,
    overlap_snapshot: overlapNames,
  };
}
