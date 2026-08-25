import assert from "node:assert/strict";

import {
  coherentReminderHours,
  inferPracticeCuePeriod,
  recommendedReminderHour,
  reminderPlanIssue,
} from "../lib/reminderCoherence.ts";

assert.equal(inferPracticeCuePeriod("After I wake up in the morning"), "morning");
assert.equal(inferPracticeCuePeriod("Before I go to bed"), "evening");
assert.equal(inferPracticeCuePeriod("At 5:30 AM"), "morning");
assert.equal(inferPracticeCuePeriod("After I close the kitchen"), null);

assert.ok(reminderPlanIssue({ cue: "Before I go to bed", timing: "prepare_before", hour: 5 }));
assert.equal(reminderPlanIssue({ cue: "Before I go to bed", timing: "prepare_before", hour: 20 }), null);
assert.equal(reminderPlanIssue({ cue: "Before I go to bed", timing: "next_day", hour: 8 }), null);
assert.equal(reminderPlanIssue({ cue: "After I wake up", timing: "at_cue", hour: 6 }), null);
assert.ok(reminderPlanIssue({ cue: "After I wake up", timing: "at_cue", hour: 18 }));
assert.equal(reminderPlanIssue({ cue: "After I close the kitchen", timing: "at_cue", hour: 18 }), null);
assert.ok(reminderPlanIssue({ cue: "After I close the kitchen", timing: "next_day", hour: 18 }));
assert.equal(reminderPlanIssue({ cue: "At 5:30 AM", timing: "at_cue", hour: 6 }), null);

const bedtimeHours = coherentReminderHours({
  cue: "Before I go to bed",
  timing: "prepare_before",
  quietStartHour: 21,
  quietEndHour: 5,
});
assert.ok(bedtimeHours.includes(20));
assert.ok(!bedtimeHours.includes(5));
assert.ok(!bedtimeHours.includes(21));
assert.equal(recommendedReminderHour({
  cue: "Before I go to bed",
  timing: "prepare_before",
  quietStartHour: 21,
  quietEndHour: 5,
}), 20);

console.log("PR127 reminder cue coherence assertions passed.");
