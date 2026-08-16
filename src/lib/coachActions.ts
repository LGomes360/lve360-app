import type { IdentityDirection } from "./activation";
import type { NextWeekPlan } from "./weeklyReview";

export const COACH_ACTION_TYPES = ["weekly_practice"] as const;
export const COACH_ACTION_STATUSES = ["proposed", "confirmed", "cancelled", "applied"] as const;

export type CoachActionStatus = (typeof COACH_ACTION_STATUSES)[number];

export type ProposedWeeklyPractice = {
  type: "weekly_practice";
  identityDirection: IdentityDirection;
  actionLabel: string;
  cue: string;
  frequencyPerWeek: number;
  minimumVersion: string;
  rationale: string;
};

export type CoachActionProposal = ProposedWeeklyPractice & {
  id: string;
  sourceTurnId: string;
  status: CoachActionStatus;
  confirmedAt: string | null;
  cancelledAt: string | null;
  appliedAt: string | null;
  appliedExperimentId: string | null;
  createdAt: string;
};

export function coachActionPlan(proposal: ProposedWeeklyPractice): NextWeekPlan {
  return {
    action_label: proposal.actionLabel,
    cue: proposal.cue,
    frequency_per_week: proposal.frequencyPerWeek,
    minimum_version: proposal.minimumVersion,
  };
}

export function coachActionFromRow(row: Record<string, unknown>): CoachActionProposal {
  return {
    id: String(row.id),
    sourceTurnId: String(row.source_turn_id),
    type: "weekly_practice",
    status: row.status as CoachActionStatus,
    identityDirection: row.identity_direction as IdentityDirection,
    actionLabel: String(row.action_label),
    cue: String(row.cue),
    frequencyPerWeek: Number(row.frequency_per_week),
    minimumVersion: String(row.minimum_version),
    rationale: String(row.rationale),
    confirmedAt: typeof row.confirmed_at === "string" ? row.confirmed_at : null,
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    appliedAt: typeof row.applied_at === "string" ? row.applied_at : null,
    appliedExperimentId: typeof row.applied_experiment_id === "string" ? row.applied_experiment_id : null,
    createdAt: String(row.created_at),
  };
}
