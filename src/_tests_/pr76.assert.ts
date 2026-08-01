import assert from "node:assert/strict";

import {
  isRegimenScheduleDue,
  normalizeRegimenSchedule,
  regimenDoseSlots,
  regimenScheduleLabel,
} from "../lib/regimenSchedule.ts";

const twiceDaily = normalizeRegimenSchedule({ cadence: "daily", times: ["08:00", "20:00"] });
assert.equal(regimenScheduleLabel(twiceDaily), "Daily at 8:00 AM and 8:00 PM");
assert.deepEqual(regimenDoseSlots(twiceDaily, "2026-08-01").map((slot) => slot.slotKey), ["08:00", "20:00"]);

const alternateDays = normalizeRegimenSchedule({ cadence: "every_n_days", times: ["18:00"], interval_days: 2, anchor_date: "2026-08-01" });
assert.equal(isRegimenScheduleDue(alternateDays, "2026-08-01"), true);
assert.equal(isRegimenScheduleDue(alternateDays, "2026-08-02"), false);
assert.equal(isRegimenScheduleDue(alternateDays, "2026-08-03"), true);

const weekdays = normalizeRegimenSchedule({ cadence: "weekdays", times: ["07:30"], weekdays: [1, 3, 5] });
assert.equal(isRegimenScheduleDue(weekdays, "2026-08-03"), true, "Monday must be due");
assert.equal(isRegimenScheduleDue(weekdays, "2026-08-04"), false, "Tuesday must not be due");

const weekly = normalizeRegimenSchedule({ cadence: "weekly", times: ["09:00"], weekdays: [0] });
assert.equal(isRegimenScheduleDue(weekly, "2026-08-02"), true, "Sunday must be due");
assert.equal(regimenDoseSlots(weekly, "2026-08-03").length, 0);

const asNeeded = normalizeRegimenSchedule({ cadence: "as_needed", times: [] });
assert.equal(regimenDoseSlots(asNeeded, "2026-08-01").length, 0);
assert.match(regimenScheduleLabel(asNeeded), /As needed/);

assert.throws(() => normalizeRegimenSchedule({ cadence: "daily", times: [] }), /time_required/);
assert.throws(() => normalizeRegimenSchedule({ cadence: "every_n_days", times: ["08:00"], interval_days: 1, anchor_date: "2026-08-01" }), /interval_required/);
assert.throws(() => normalizeRegimenSchedule({ cadence: "weekly", times: ["08:00"], weekdays: [1, 2] }), /weekly_day_required/);

console.log("PR76 schedule assertions passed");
