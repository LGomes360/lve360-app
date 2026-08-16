import assert from "node:assert/strict";

import type { WeeklyExperiment } from "../lib/activation.ts";
import type { ExperimentBlueprintContext } from "../lib/blueprintContext.ts";
import {
  connectionType,
  practiceGoalOptions,
  resolvePracticeConnection,
} from "../lib/practiceConnection.ts";

const goals = practiceGoalOptions({
  id: "goal-row-1",
  goals: ["Improve sleep", "Improve sleep", "Move consistently"],
  custom_goal: null,
  target_weight: 185,
  target_sleep: null,
  target_energy: 8,
});

assert.deepEqual(goals.map((goal) => goal.key), [
  "named:improve-sleep",
  "named:move-consistently",
  "target:weight",
  "target:energy",
]);
assert.equal(connectionType(false, false), "independent");
assert.equal(connectionType(true, false), "goal");
assert.equal(connectionType(false, true), "blueprint");
assert.equal(connectionType(true, true), "both");

const experiment = (overrides: Partial<WeeklyExperiment> = {}): WeeklyExperiment => ({
  id: "experiment-1",
  user_id: "member-1",
  source_stack_id: null,
  source_action_id: null,
  connection_type: "independent",
  goal_id: null,
  goal_key: null,
  goal_label_snapshot: null,
  identity_direction: "sleep",
  action_label: "Keep a consistent wake time",
  cue: "turn off my alarm",
  frequency_per_week: 5,
  minimum_version: "Get out of bed",
  reminder_preference: "none",
  reminder_timing: "at_cue",
  reminder_hour: null,
  onboarding_step: 6,
  status: "active",
  week_start: "2026-08-10",
  activated_at: "2026-08-10T12:00:00.000Z",
  created_at: "2026-08-10T12:00:00.000Z",
  updated_at: "2026-08-10T12:00:00.000Z",
  ...overrides,
});

const blueprint: ExperimentBlueprintContext = {
  source_stack_id: "stack-1",
  source_action_id: "priority-1",
  priority_label: "Keep a consistent wake time",
  priority_category: "sleep",
  priority_kind: "lifestyle",
  blueprint_created_at: "2026-08-09T12:00:00.000Z",
  is_current_blueprint: true,
  needs_review: false,
};

const currentGoal = resolvePracticeConnection(experiment({
  connection_type: "goal",
  goal_id: "goal-row-1",
  goal_key: "named:improve-sleep",
  goal_label_snapshot: "Improve sleep",
}), goals, null);
assert.equal(currentGoal.goal?.status, "current");
assert.equal(currentGoal.summary, "Supports saved goal: Improve sleep");

const both = resolvePracticeConnection(experiment({
  connection_type: "both",
  source_stack_id: "stack-1",
  source_action_id: "priority-1",
  goal_id: "goal-row-1",
  goal_key: "named:improve-sleep",
  goal_label_snapshot: "Improve sleep",
}), goals, blueprint);
assert.equal(both.type, "both");
assert.match(both.summary, /Supports saved goal: Improve sleep/);
assert.match(both.summary, /Supports Blueprint priority: Keep a consistent wake time/);

const removedGoal = resolvePracticeConnection(experiment({
  connection_type: "goal",
  goal_id: null,
  goal_key: "named:old-goal",
  goal_label_snapshot: "An earlier saved goal",
}), goals, null);
assert.equal(removedGoal.goal?.status, "historical");
assert.match(removedGoal.summary, /An earlier saved goal/);

const independent = resolvePracticeConnection(experiment({ action_label: "Improve sleep" }), goals, blueprint);
assert.equal(independent.type, "independent");
assert.equal(independent.goal, null, "Matching words must never create a goal link.");
assert.equal(independent.blueprint, null, "Available Blueprint context must never create a link without stored provenance.");
assert.equal(independent.summary, "Independently chosen for this week");

console.log("PR113 explicit practice-connection scenarios passed.");
