import type { WeeklyExperiment } from "./activation.ts";
import type { ReviewDecision } from "./weeklyReview.ts";

export const PRACTICE_STATUSES = ["active", "paused", "archived"] as const;
export type PracticeStatus = (typeof PRACTICE_STATUSES)[number];

export type DurablePracticeSeed = {
  user_id: string;
  identity_direction: NonNullable<WeeklyExperiment["identity_direction"]>;
  action_label: string;
  cue: string;
  frequency_per_week: number;
  target_quantity: number | null;
  quantity_unit: string | null;
  minimum_version: string;
  minimum_quantity: number | null;
  minimum_quantity_unit: string | null;
  reminder_preference: WeeklyExperiment["reminder_preference"];
  reminder_timing: WeeklyExperiment["reminder_timing"];
  reminder_hour: number | null;
  connection_type: WeeklyExperiment["connection_type"];
  source_stack_id: string | null;
  source_action_id: string | null;
  goal_id: string | null;
  goal_key: string | null;
  goal_label_snapshot: string | null;
};

export type PracticeContinuity =
  | {
      kind: "continue";
      currentPracticeId: string;
      nextExperimentPracticeId: string;
      nextPracticeStatus: "active";
      requiresNewPractice: false;
    }
  | {
      kind: "pause";
      currentPracticeId: string;
      nextExperimentPracticeId: null;
      nextPracticeStatus: "paused";
      requiresNewPractice: false;
    }
  | {
      kind: "replace";
      currentPracticeId: string;
      nextExperimentPracticeId: null;
      nextPracticeStatus: "archived";
      requiresNewPractice: true;
    };

function readyText(value: string | null, minimumLength: number): value is string {
  return typeof value === "string" && value.trim().length >= minimumLength;
}

export function durablePracticeSeedFromExperiment(
  experiment: WeeklyExperiment,
): DurablePracticeSeed | null {
  if (
    !experiment.identity_direction
    || !readyText(experiment.action_label, 4)
    || !readyText(experiment.cue, 2)
    || !Number.isInteger(experiment.frequency_per_week)
    || Number(experiment.frequency_per_week) < 1
    || Number(experiment.frequency_per_week) > 7
    || !readyText(experiment.minimum_version, 2)
  ) {
    return null;
  }

  return {
    user_id: experiment.user_id,
    identity_direction: experiment.identity_direction,
    action_label: experiment.action_label.trim(),
    cue: experiment.cue.trim(),
    frequency_per_week: Number(experiment.frequency_per_week),
    target_quantity: experiment.target_quantity,
    quantity_unit: experiment.quantity_unit?.trim() || null,
    minimum_version: experiment.minimum_version.trim(),
    minimum_quantity: experiment.minimum_quantity,
    minimum_quantity_unit: experiment.minimum_quantity_unit?.trim() || null,
    reminder_preference: experiment.reminder_preference,
    reminder_timing: experiment.reminder_timing,
    reminder_hour: experiment.reminder_hour,
    connection_type: experiment.connection_type,
    source_stack_id: experiment.source_stack_id,
    source_action_id: experiment.source_action_id,
    goal_id: experiment.goal_id,
    goal_key: experiment.goal_key,
    goal_label_snapshot: experiment.goal_label_snapshot,
  };
}

export function resolvePracticeContinuity(
  decision: ReviewDecision,
  currentPracticeId: string,
): PracticeContinuity {
  if (decision === "pause") {
    return {
      kind: "pause",
      currentPracticeId,
      nextExperimentPracticeId: null,
      nextPracticeStatus: "paused",
      requiresNewPractice: false,
    };
  }

  if (decision === "swap") {
    return {
      kind: "replace",
      currentPracticeId,
      nextExperimentPracticeId: null,
      nextPracticeStatus: "archived",
      requiresNewPractice: true,
    };
  }

  return {
    kind: "continue",
    currentPracticeId,
    nextExperimentPracticeId: currentPracticeId,
    nextPracticeStatus: "active",
    requiresNewPractice: false,
  };
}
