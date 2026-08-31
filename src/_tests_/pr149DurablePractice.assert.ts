import assert from "node:assert/strict";

import type { WeeklyExperiment } from "../lib/activation.ts";
import {
  durablePracticeSeedFromExperiment,
  resolvePracticeContinuity,
} from "../lib/practiceDomain.ts";

const readyExperiment: WeeklyExperiment = {
  id: "experiment-1",
  user_id: "member-1",
  practice_id: null,
  source_stack_id: null,
  source_action_id: null,
  connection_type: "independent",
  goal_id: null,
  goal_key: null,
  goal_label_snapshot: null,
  identity_direction: "movement",
  action_label: "  Walk after lunch  ",
  cue: "  After clearing the plate  ",
  frequency_per_week: 5,
  target_quantity: 10,
  quantity_unit: " minutes ",
  minimum_quantity: 2,
  minimum_quantity_unit: " minutes ",
  minimum_version: "  Walk to the driveway  ",
  reminder_preference: "email",
  reminder_timing: "at_cue",
  reminder_hour: 13,
  onboarding_step: 6,
  status: "active",
  week_start: "2026-08-31",
  activated_at: "2026-08-31T13:00:00.000Z",
  created_at: "2026-08-31T12:00:00.000Z",
  updated_at: "2026-08-31T13:00:00.000Z",
};

const seed = durablePracticeSeedFromExperiment(readyExperiment);
assert.ok(seed, "A complete active experiment should produce a durable Practice seed.");
assert.equal(seed.action_label, "Walk after lunch");
assert.equal(seed.cue, "After clearing the plate");
assert.equal(seed.quantity_unit, "minutes");
assert.equal(seed.minimum_version, "Walk to the driveway");
assert.equal(seed.minimum_quantity_unit, "minutes");

assert.equal(
  durablePracticeSeedFromExperiment({ ...readyExperiment, minimum_version: null }),
  null,
  "An incomplete experiment must not be promoted to canonical Practice state.",
);

for (const decision of ["keep", "shrink", "advance"] as const) {
  assert.deepEqual(resolvePracticeContinuity(decision, "practice-1"), {
    kind: "continue",
    currentPracticeId: "practice-1",
    nextExperimentPracticeId: "practice-1",
    nextPracticeStatus: "active",
    requiresNewPractice: false,
  });
}

assert.deepEqual(resolvePracticeContinuity("pause", "practice-1"), {
  kind: "pause",
  currentPracticeId: "practice-1",
  nextExperimentPracticeId: null,
  nextPracticeStatus: "paused",
  requiresNewPractice: false,
});

assert.deepEqual(resolvePracticeContinuity("swap", "practice-1"), {
  kind: "replace",
  currentPracticeId: "practice-1",
  nextExperimentPracticeId: null,
  nextPracticeStatus: "archived",
  requiresNewPractice: true,
});

console.log("PR149 durable Practice domain assertions passed.");
