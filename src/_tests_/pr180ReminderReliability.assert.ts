import assert from "node:assert/strict";

import {
  buildReminderDispatchOutcome,
  canRetryQueuedReminderDelivery,
  withReminderOperationRetry,
} from "../lib/reminderReliability.ts";

assert.deepEqual(buildReminderDispatchOutcome({
  sent: 0,
  skipped: 2,
  failed: 0,
  skipReasons: { wrong_hour: 2 },
  failureReasons: {},
}), {
  status: 200,
  payload: {
    ok: true,
    sent: 0,
    skipped: 2,
    failed: 0,
    skipReasons: { wrong_hour: 2 },
    failureReasons: {},
  },
});
const partialFailure = buildReminderDispatchOutcome({
  sent: 1,
  skipped: 0,
  failed: 1,
  skipReasons: {},
  failureReasons: { profile_lookup_failed: 1 },
});
assert.equal(partialFailure.status, 503);
assert.equal(partialFailure.payload.ok, false);
assert.equal(canRetryQueuedReminderDelivery({
  status: "queued",
  provider_id: null,
  created_at: "2026-09-14T10:00:00.000Z",
}, new Date("2026-09-14T11:00:00.000Z")), true);
assert.equal(canRetryQueuedReminderDelivery({
  status: "queued",
  provider_id: null,
  created_at: "2026-09-13T10:00:00.000Z",
}, new Date("2026-09-14T11:00:00.000Z")), false);
assert.equal(canRetryQueuedReminderDelivery({
  status: "accepted",
  provider_id: "provider",
  created_at: "2026-09-14T10:00:00.000Z",
}, new Date("2026-09-14T11:00:00.000Z")), false);

let attempts = 0;
const delays: number[] = [];
const notices: number[] = [];
const recovered = await withReminderOperationRetry(async () => {
  attempts += 1;
  return attempts < 3
    ? { data: null, error: { code: "temporary" } }
    : { data: "ready", error: null };
}, {
  baseDelayMs: 10,
  sleep: async (delay) => { delays.push(delay); },
  onRetry: ({ attempt }) => { notices.push(attempt); },
});
assert.equal(recovered.data, "ready");
assert.equal(attempts, 3);
assert.deepEqual(delays, [10, 20]);
assert.deepEqual(notices, [1, 2]);

attempts = 0;
const exhausted = await withReminderOperationRetry(async () => {
  attempts += 1;
  return { data: null, error: { code: `failure_${attempts}` } };
}, {
  maxAttempts: 2,
  baseDelayMs: 0,
  sleep: async () => {},
});
assert.equal(attempts, 2);
assert.deepEqual(exhausted.error, { code: "failure_2" });

attempts = 0;
const recoveredThrow = await withReminderOperationRetry(async () => {
  attempts += 1;
  if (attempts === 1) throw new TypeError("network");
  return { data: "recovered", error: null };
}, {
  baseDelayMs: 0,
  sleep: async () => {},
});
assert.equal(recoveredThrow.data, "recovered");
assert.equal(attempts, 2);

await assert.rejects(
  () => withReminderOperationRetry(async () => {
    throw new TypeError("still unavailable");
  }, { maxAttempts: 2, baseDelayMs: 0, sleep: async () => {} }),
  /still unavailable/,
);

console.log("PR180 reminder reliability assertions passed.");
