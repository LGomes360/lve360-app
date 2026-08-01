import assert from "node:assert/strict";

import { normalizeHormoneRecordInput } from "../lib/medicationRecord.ts";
import { evaluateReminder, reminderIdempotencyKey } from "../lib/reminderSchedule.ts";

const base = {
  timezone: "America/Denver",
  cueHour: 8,
  quietStartHour: 21,
  quietEndHour: 7,
  weekStart: "2026-08-03",
  completedDates: [] as string[],
  reviewCompleted: false,
  targetCount: 3,
};

const nextDay = evaluateReminder({
  ...base,
  timing: "next_day",
  now: new Date("2026-08-04T14:15:00.000Z"),
});
assert.equal(nextDay.decision?.kind, "next_day_checkin");
assert.equal(nextDay.decision?.targetDate, "2026-08-03");

const completedYesterday = evaluateReminder({
  ...base,
  timing: "next_day",
  completedDates: ["2026-08-03"],
  now: new Date("2026-08-04T14:15:00.000Z"),
});
assert.equal(completedYesterday.decision, null);
assert.equal(completedYesterday.reason, "completed_target");

const targetMet = evaluateReminder({
  ...base,
  timing: "at_cue",
  completedDates: ["2026-08-03", "2026-08-04", "2026-08-05"],
  now: new Date("2026-08-06T14:15:00.000Z"),
});
assert.equal(targetMet.decision, null);
assert.equal(targetMet.reason, "target_met");

assert.equal(
  reminderIdempotencyKey("next_day_checkin", "experiment-1", "2026-08-04", "2026-08-03"),
  "reminder:next_day_checkin:experiment-1:2026-08-04:2026-08-03",
);

const hormone = normalizeHormoneRecordInput({
  name: "Testosterone cypionate",
  dose: "80 mg",
  timing: "Monday and Thursday evenings",
  purpose: "Hormone replacement",
  instruction_authority: "clinician",
});
assert.equal(hormone.name, "Testosterone cypionate");
assert.equal(hormone.instruction_authority, "clinician");
assert.throws(
  () => normalizeHormoneRecordInput({ name: "Testosterone", instruction_authority: "lve360" }),
  /hormone_instruction_source_required/,
);

console.log("PR75 schedule and hormone assertions passed");
