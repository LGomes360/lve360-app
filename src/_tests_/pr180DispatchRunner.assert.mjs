import assert from "node:assert/strict";

import { runReminderDispatch, validateReminderDispatch } from "../../scripts/run-reminder-dispatch.mjs";

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});
const success = JSON.stringify({
  ok: true,
  sent: 0,
  skipped: 2,
  failed: 0,
  skipReasons: { wrong_hour: 2 },
  failureReasons: {},
});

assert.equal(validateReminderDispatch(JSON.parse(success)).failed, 0);
assert.throws(() => validateReminderDispatch({
  ok: true,
  sent: 0,
  skipped: 2,
  failed: 0,
  skipReasons: { wrong_hour: 1 },
  failureReasons: {},
}), /inconsistent skipReasons/);

let calls = 0;
const recovered = await runReminderDispatch({
  secret: "test-secret",
  sleep: async () => {},
  fetchImpl: async () => {
    calls += 1;
    return calls === 1
      ? response(503, JSON.stringify({ ok: false, error: "load_failed" }))
      : response(200, success);
  },
});
assert.equal(calls, 2);
assert.equal(recovered.skipped, 2);

calls = 0;
await runReminderDispatch({
  secret: "test-secret",
  sleep: async () => {},
  fetchImpl: async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("temporary network failure");
    return response(200, success);
  },
});
assert.equal(calls, 2);

calls = 0;
await runReminderDispatch({
  secret: "test-secret",
  sleep: async () => {},
  fetchImpl: async () => {
    calls += 1;
    if (calls === 1) throw new DOMException("request timed out", "AbortError");
    return response(200, success);
  },
});
assert.equal(calls, 2, "A timed-out request must receive one bounded retry.");

calls = 0;
await assert.rejects(
  () => runReminderDispatch({
    secret: "test-secret",
    maxAttempts: 2,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return response(503, JSON.stringify({
        ok: false,
        sent: 1,
        skipped: 0,
        failed: 1,
        failureReasons: { profile_lookup_failed: 1 },
      }));
    },
  }),
  /HTTP 503/,
);
assert.equal(calls, 1, "A partial dispatch failure must stay visible instead of being retried green.");

calls = 0;
await assert.rejects(
  () => runReminderDispatch({
    secret: "test-secret",
    maxAttempts: 2,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return response(503, JSON.stringify({ ok: false, error: "load_failed" }));
    },
  }),
  /HTTP 503/,
);
assert.equal(calls, 2, "A pre-dispatch load failure must exhaust its bounded retry budget.");

calls = 0;
await assert.rejects(
  () => runReminderDispatch({
    secret: "test-secret",
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return response(200, JSON.stringify({ ok: true, sent: 1, skipped: 0, failed: 1 }));
    },
  }),
  /reported failure/,
);
assert.equal(calls, 1, "A complete semantic failure must not be hidden by another attempt.");

for (const body of ["not-json", `${success}${success}`]) {
  await assert.rejects(
    () => runReminderDispatch({
      secret: "test-secret",
      sleep: async () => {},
      fetchImpl: async () => response(200, body),
    }),
    /malformed or multiple JSON documents/,
  );
}

console.log("PR180 dispatcher runner assertions passed.");
