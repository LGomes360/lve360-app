import assert from "node:assert/strict";

import type { WeeklyExperiment } from "../lib/activation";
import { isReviewDue, reviewDueDate, suggestedNextPlan, validateNextPlan } from "../lib/weeklyReview";

const experiment: WeeklyExperiment = {
  id: "experiment-1",
  user_id: "user-1",
  source_stack_id: null,
  source_action_id: null,
  identity_direction: "movement",
  action_label: "Take a 10-minute walk after lunch",
  cue: "finish lunch",
  frequency_per_week: 4,
  minimum_version: "Walk for two minutes",
  reminder_preference: "none",
  onboarding_step: 6,
  status: "active",
  week_start: "2026-07-20",
  activated_at: "2026-07-20T12:00:00.000Z",
  created_at: "2026-07-20T12:00:00.000Z",
  updated_at: "2026-07-20T12:00:00.000Z",
};

assert.equal(reviewDueDate(experiment.week_start), "2026-07-26");
assert.equal(isReviewDue(experiment.week_start, "2026-07-25"), false);
assert.equal(isReviewDue(experiment.week_start, "2026-07-26"), true);
assert.equal(suggestedNextPlan(experiment, "shrink")?.frequency_per_week, 3);
assert.equal(suggestedNextPlan(experiment, "advance")?.frequency_per_week, 5);
assert.equal(suggestedNextPlan(experiment, "pause"), null);
assert.deepEqual(validateNextPlan({
  action_label: "  Take a short walk after lunch  ",
  cue: "  finish lunch ",
  frequency_per_week: 3,
  minimum_version: " Walk for one minute ",
}), {
  action_label: "Take a short walk after lunch",
  cue: "finish lunch",
  frequency_per_week: 3,
  minimum_version: "Walk for one minute",
});
assert.equal(validateNextPlan({
  action_label: "Change my medication dose",
  cue: "finish lunch",
  frequency_per_week: 3,
  minimum_version: "Take half the medication",
}), null);

console.log("weekly review assertions passed");
