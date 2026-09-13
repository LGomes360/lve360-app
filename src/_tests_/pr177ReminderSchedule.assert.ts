import assert from "node:assert/strict";

import { evaluateReminder, normalizeReminderWeekdays } from "../lib/reminderSchedule.ts";

const base = {
  timezone: "America/Denver",
  cueHour: 8,
  quietStartHour: 21,
  quietEndHour: 5,
  weekStart: "2026-09-07",
  completedDates: [] as string[],
  reviewCompleted: false,
  targetCount: 3,
  timing: "at_cue" as const,
};

assert.deepEqual(normalizeReminderWeekdays([5, 1, 5, 3]), [1, 3, 5]);
assert.deepEqual(normalizeReminderWeekdays([]), []);
assert.equal(normalizeReminderWeekdays([7]), null);
assert.equal(normalizeReminderWeekdays([1, "3"]), null);
assert.equal(normalizeReminderWeekdays("Monday"), null);

const outsideSchedule = evaluateReminder({
  ...base,
  reminderWeekdays: [1, 3, 5],
  now: new Date("2026-09-08T14:10:00.000Z"),
});
assert.equal(outsideSchedule.decision, null);
assert.equal(outsideSchedule.reason, "outside_schedule");

const scheduledDay = evaluateReminder({
  ...base,
  reminderWeekdays: [1, 3, 5],
  now: new Date("2026-09-09T14:10:00.000Z"),
});
assert.ok(scheduledDay.decision, "A selected weekday must remain eligible for delivery.");

const skipped = evaluateReminder({
  ...base,
  skippedLocalDate: "2026-09-09",
  now: new Date("2026-09-09T14:10:00.000Z"),
});
assert.equal(skipped.reason, "skipped_by_member");

const paused = evaluateReminder({
  ...base,
  pausedUntil: "2026-09-10",
  now: new Date("2026-09-09T14:10:00.000Z"),
});
assert.equal(paused.reason, "snoozed");

const resumed = evaluateReminder({
  ...base,
  pausedUntil: "2026-09-10",
  now: new Date("2026-09-10T14:10:00.000Z"),
});
assert.ok(resumed.decision, "Delivery must resume on the saved resume date.");

const reviewIgnoresPracticeDays = evaluateReminder({
  ...base,
  reminderWeekdays: [1],
  now: new Date("2026-09-13T14:10:00.000Z"),
});
assert.equal(reviewIgnoresPracticeDays.decision?.kind, "weekly_review");

console.log("PR177 reminder schedule assertions passed.");
