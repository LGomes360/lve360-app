import assert from "node:assert/strict";

import { validateAppleHealthSyncPayload } from "../lib/connectedHealth.ts";

const now = new Date("2026-09-16T18:00:00.000Z");
const valid = validateAppleHealthSyncPayload({
  requested_data_types: ["steps", "sleep", "weight"],
  days: [{
    local_date: "2026-09-16",
    time_zone: "America/Denver",
    steps: 8421,
    sleep_minutes: 438,
    resting_heart_rate: null,
    weight_kg: 88.4,
    active_energy_kcal: null,
    exercise_minutes: null,
    source_updated_at: "2026-09-16T17:30:00.000Z",
  }],
}, now);
assert.ok(valid);
assert.equal(valid.days[0].steps, 8421);
assert.equal(valid.days[0].source_updated_at, "2026-09-16T17:30:00.000Z");

assert.equal(validateAppleHealthSyncPayload({
  requested_data_types: ["steps", "clinical_records"],
  days: [{ local_date: "2026-09-16", time_zone: "UTC", steps: 1 }],
}, now), null, "unknown or expanded health scopes must be rejected");

assert.equal(validateAppleHealthSyncPayload({
  requested_data_types: ["steps"],
  days: [{ local_date: "2026-09-16", time_zone: "UTC", steps: -1 }],
}, now), null, "impossible metrics must be rejected");

assert.equal(validateAppleHealthSyncPayload({
  requested_data_types: ["steps"],
  days: [{ local_date: "2026-09-16", time_zone: "UTC", steps: 100 }, { local_date: "2026-09-16", time_zone: "UTC", steps: 200 }],
}, now), null, "a sync may not contain duplicate local dates");

assert.equal(validateAppleHealthSyncPayload({
  requested_data_types: ["steps"],
  days: [{ local_date: "2026-01-01", time_zone: "UTC", steps: 100 }],
}, now), null, "the first sync is bounded to recent daily aggregates");

assert.equal(validateAppleHealthSyncPayload({
  requested_data_types: ["steps"],
  days: [{ local_date: "2026-09-16", time_zone: "UTC", steps: 100, weight_kg: 88 }],
}, now), null, "a payload may not include a category the member was not asked to share");

console.log("PR183 connected health payload assertions passed.");
