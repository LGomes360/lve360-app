import assert from "node:assert/strict";

import { routineScheduleConflicts, routineWrittenScheduleLabel } from "../lib/routine.ts";
import type { RegimenSchedule } from "../lib/regimenSchedule.ts";

function schedule(
  cadence: RegimenSchedule["cadence"],
  times: string[],
  overrides: Partial<RegimenSchedule> = {},
): RegimenSchedule {
  return {
    cadence,
    times,
    weekdays: [],
    interval_days: null,
    anchor_date: null,
    ...overrides,
  };
}

function codes(timing: string | null, structured: RegimenSchedule | null) {
  return routineScheduleConflicts({ timing, timing_text: timing, schedule: structured }).map((conflict) => conflict.code);
}

assert.deepEqual(codes("Take in the morning", schedule("daily", ["19:00"])), ["time_of_day"]);
assert.deepEqual(codes("Take in the evening", schedule("daily", ["07:00"])), ["time_of_day"]);
assert.deepEqual(codes("AM/PM", schedule("daily", ["07:00"])), ["frequency", "time_of_day"]);
assert.deepEqual(codes("Twice daily", schedule("daily", ["07:00"])), ["frequency"]);
assert.deepEqual(codes("2 x AM", schedule("daily", ["10:30"])), ["frequency"]);
assert.deepEqual(codes("2x PM", schedule("daily", ["19:00"])), ["frequency"]);
assert.deepEqual(codes("2 x AM", schedule("daily", ["08:30", "10:30"])), []);
assert.deepEqual(codes("Once daily", schedule("daily", ["07:00", "19:00"])), ["frequency"]);
assert.deepEqual(codes("Once weekly on Sunday", schedule("daily", ["08:00"])), ["cadence"]);
assert.deepEqual(codes("Every other day at 7 AM", schedule("daily", ["07:00"])), ["cadence"]);
assert.deepEqual(codes("Every other day at 7 AM", schedule("every_n_days", ["07:00"], { interval_days: 2, anchor_date: "2026-08-22" })), []);
assert.deepEqual(codes("Daily at 7 PM", schedule("daily", ["19:00"])), []);
assert.deepEqual(codes("Daily at 7 PM", schedule("daily", ["20:00"])), ["exact_time"]);
assert.deepEqual(codes("With food", schedule("daily", ["08:00"])), []);
assert.deepEqual(codes(null, schedule("daily", ["08:00"])), []);
assert.deepEqual(codes("Before bed", null), []);
assert.equal(routineWrittenScheduleLabel({ timing: "Fallback", timing_text: "Original instruction" }), "Original instruction");

console.log("PR123 Routine schedule conflict assertions passed.");
