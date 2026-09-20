import assert from "node:assert/strict";
import { validateAppleHealthSyncPayload } from "../lib/connectedHealth.ts";

const now = new Date("2026-09-19T18:00:00.000Z");
const base = {
  requested_data_types: ["steps"],
  days: [{ local_date: "2026-09-19", time_zone: "America/Denver", steps: 5000 }],
};

assert.deepEqual(validateAppleHealthSyncPayload(base, now)?.removed_local_dates, []);
assert.deepEqual(validateAppleHealthSyncPayload({ ...base, days: [], removed_local_dates: ["2026-09-18"] }, now)?.removed_local_dates, ["2026-09-18"]);
assert.ok(validateAppleHealthSyncPayload({ ...base, days: [] }, now), "an empty Health store can establish a connection");
assert.equal(validateAppleHealthSyncPayload({ ...base, requested_data_types: [], days: [] }, now), null, "a connection must choose at least one category");
assert.equal(validateAppleHealthSyncPayload({ ...base, removed_local_dates: ["2026-09-19"] }, now), null, "one date cannot be updated and removed");
assert.equal(validateAppleHealthSyncPayload({ ...base, days: [], removed_local_dates: ["2026-09-18", "2026-09-18"] }, now), null, "duplicate removals are rejected");
assert.equal(validateAppleHealthSyncPayload({ ...base, days: [], removed_local_dates: ["2025-09-18"] }, now), null, "removals must stay inside the bounded window");
assert.equal(validateAppleHealthSyncPayload({ ...base, removed_local_dates: ["2026-09-20"] }, now)?.removed_local_dates.length, 1);

console.log("PR184 connected health contract assertions passed.");
