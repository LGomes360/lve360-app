import assert from "node:assert/strict";

import {
  comparableAdaptiveHistory,
  isAdaptiveLowData,
  recommendedAdaptiveReviewDecision,
  type AdaptiveDecisionContext,
  type AdaptiveHistoryWeek,
} from "../lib/weeklySynthesisDecision.ts";

const experiment = {
  id: "current",
  identity_direction: "movement",
  action_label: "Walk after dinner",
  cue: "After dinner",
  frequency_per_week: 5,
  minimum_version: "Walk for two minutes",
  week_start: "2026-08-17",
};

function week(overrides: Partial<AdaptiveHistoryWeek & { experimentId: string; weekStart: string }> = {}): AdaptiveHistoryWeek & { experimentId: string; weekStart: string } {
  return {
    experimentId: "prior-1",
    weekStart: "2026-08-10",
    identityDirection: "movement",
    actionLabel: "Walk after dinner",
    completionCount: 4,
    target: 5,
    difficulty: 2,
    valueRating: 4,
    ...overrides,
  };
}

function context(overrides: Partial<AdaptiveDecisionContext> = {}): AdaptiveDecisionContext {
  return {
    identityDirection: experiment.identity_direction,
    actionLabel: experiment.action_label,
    completedCount: 4,
    target: 5,
    difficulty: 2,
    valueRating: 4,
    checkInCount: 0,
    history: [],
    ...overrides,
  };
}

assert.equal(recommendedAdaptiveReviewDecision(context({ valueRating: 2 })), "swap", "One low-value week should suggest a different experiment, not a pause.");
assert.equal(recommendedAdaptiveReviewDecision(context({
  valueRating: 2,
  history: [week({ valueRating: 2 }), week({ experimentId: "prior-2", weekStart: "2026-08-03", valueRating: 1 })],
})), "pause", "Repeated low value in the same focus area should make pause available.");
assert.equal(recommendedAdaptiveReviewDecision(context({
  history: [week(), week({ experimentId: "prior-2", weekStart: "2026-08-03", completionCount: 5 })],
})), "advance", "Sustained useful, easy completion should support the smallest progression.");
assert.equal(recommendedAdaptiveReviewDecision(context({
  history: [
    week({ actionLabel: "Do morning pushups" }),
    week({ experimentId: "prior-2", weekStart: "2026-08-03", actionLabel: "Climb the stairs" }),
  ],
})), "keep", "Success with different practices in the same focus area must not automatically advance the current practice.");
assert.equal(recommendedAdaptiveReviewDecision(context({
  valueRating: 2,
  history: [
    week({ identityDirection: "sleep", actionLabel: "Keep a bedtime", valueRating: 1 }),
    week({ experimentId: "prior-2", identityDirection: "nutrition", actionLabel: "Eat vegetables", valueRating: 2 }),
  ],
})), "swap", "Unrelated history must not trigger a pause.");

const sparseWithHistory = context({
  completedCount: 0,
  history: [week(), week({ experimentId: "prior-2", weekStart: "2026-08-03" })],
});
assert.equal(isAdaptiveLowData(sparseWithHistory), false, "Two comparable prior weeks should provide context while current-week uncertainty remains explicit.");
assert.equal(comparableAdaptiveHistory(sparseWithHistory).length, 2);

console.log("PR116 adaptive weekly synthesis assertions passed.");
