import assert from "node:assert/strict";

import {
  coachLimitAnswer,
  coachPeriod,
  coachResetLabel,
  coachUsageSummary,
} from "../lib/coachAllowance.ts";

const now = new Date("2026-08-24T18:00:00.000Z");
assert.deepEqual(coachPeriod(now), {
  periodStart: "2026-08-01",
  startAt: "2026-08-01T00:00:00.000Z",
  resetAt: "2026-09-01T00:00:00.000Z",
});

const available = coachUsageSummary({
  turns: 40,
  estimatedCostUsd: 0.42,
  bonusTurns: 10,
  limit: { monthlyTurns: 40, monthlyCostUsd: 1.5 },
  now,
});
assert.equal(available.remaining, 10);
assert.equal(available.exhausted, false);
assert.equal(available.allowance.totalTurns, 50);
assert.equal(available.period.resetAt, "2026-09-01T00:00:00.000Z");

const turnLimited = coachUsageSummary({
  turns: 40,
  estimatedCostUsd: 0.42,
  limit: { monthlyTurns: 40, monthlyCostUsd: 1.5 },
  now,
});
assert.equal(turnLimited.remaining, 0);
assert.equal(turnLimited.exhausted, true);
assert.equal(turnLimited.limitedBy, "turns");

const costLimited = coachUsageSummary({
  turns: 4,
  estimatedCostUsd: 1.5,
  bonusTurns: 100,
  limit: { monthlyTurns: 40, monthlyCostUsd: 1.5 },
  now,
});
assert.equal(costLimited.remaining, 0);
assert.equal(costLimited.exhausted, true);
assert.equal(costLimited.limitedBy, "cost", "Testing turns must never bypass the production cost ceiling.");

assert.equal(coachResetLabel(available.period.resetAt), "September 1, 2026");
assert.match(coachLimitAnswer(turnLimited), /resets on September 1, 2026/i);
assert.match(coachLimitAnswer(turnLimited), /Today, Routine, Journey, and your saved Blueprint/);

console.log("PR130 coach allowance calculations passed.");
