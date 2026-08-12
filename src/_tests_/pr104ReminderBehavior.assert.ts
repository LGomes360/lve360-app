import assert from "node:assert/strict";

import { buildReminderBehaviorSuggestion, sameReminderSuggestion } from "../lib/reminderBehavior.ts";

const base = {
  currentHour: 18,
  quietStartHour: 21,
  quietEndHour: 5,
  completionHours: [] as number[],
};

assert.deepEqual(buildReminderBehaviorSuggestion({
  ...base,
  feedback: ["too_early", "too_early"],
}), {
  kind: "time",
  currentHour: 18,
  proposedHour: 19,
  reason: "feedback_too_early",
  evidenceCount: 2,
});

assert.deepEqual(buildReminderBehaviorSuggestion({
  ...base,
  feedback: ["too_late", "too_late", "useful"],
}), {
  kind: "time",
  currentHour: 18,
  proposedHour: 17,
  reason: "feedback_too_late",
  evidenceCount: 2,
});

assert.equal(buildReminderBehaviorSuggestion({
  currentHour: 20,
  quietStartHour: 21,
  quietEndHour: 5,
  feedback: ["too_early", "too_early"],
  completionHours: [],
}), null, "A behavior suggestion must never cross into quiet hours.");

assert.deepEqual(buildReminderBehaviorSuggestion({
  ...base,
  feedback: [],
  completionHours: [20, 21, 20],
}), {
  kind: "time",
  currentHour: 18,
  proposedHour: 19,
  reason: "completion_pattern",
  evidenceCount: 3,
});

assert.deepEqual(buildReminderBehaviorSuggestion({
  ...base,
  feedback: ["not_useful", "dismissed"],
}), {
  kind: "pause",
  currentHour: 18,
  proposedHour: null,
  reason: "repeated_not_useful",
  evidenceCount: 2,
});

const suggestion = buildReminderBehaviorSuggestion({ ...base, feedback: ["too_early", "too_early"] });
assert.ok(suggestion);
assert.equal(sameReminderSuggestion(suggestion!, {
  adjustment_kind: "time",
  current_hour: 18,
  proposed_hour: 19,
}), true, "A resolved suggestion must not be repeatedly shown.");

console.log("PR104 reminder behavior assertions passed.");
