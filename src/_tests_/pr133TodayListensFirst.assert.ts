import assert from "node:assert/strict";

import {
  deterministicTodayBrief,
  isLowerCapacityCheckIn,
  shouldGenerateTodayBrief,
  todayBriefGrounding,
  type TodayBriefContext,
} from "../lib/todayBrief.ts";

const base: TodayBriefContext = {
  localDate: "2026-08-25",
  experiment: {
    id: "11111111-1111-4111-8111-111111111111",
    identity: "Someone who moves consistently",
    actionLabel: "Take a 10-minute walk after lunch",
    cue: "finish lunch",
    minimumVersion: "Walk for two minutes",
    target: 4,
    completed: 1,
    completedToday: false,
    connectionSummary: "Supports saved goal: Improve daily energy",
  },
  blueprint: {
    stackId: "22222222-2222-4222-8222-222222222222",
    needsRefresh: false,
    safetyNeedsAttention: false,
  },
  checkIn: null,
  reviewDue: false,
};

assert.equal(isLowerCapacityCheckIn(null), false);
assert.equal(isLowerCapacityCheckIn({ sleep: 2, energy: 8, weightRecorded: false }), true);
assert.equal(isLowerCapacityCheckIn({ sleep: 5, energy: 3, weightRecorded: false }), true);
assert.equal(isLowerCapacityCheckIn({ sleep: 4, energy: 8, weightRecorded: true }), false);

const normal = deterministicTodayBrief(base);
assert.equal(normal.nextAction, base.experiment?.actionLabel);
assert.equal(shouldGenerateTodayBrief(base), true);

const lowerCapacity: TodayBriefContext = {
  ...base,
  checkIn: { sleep: 2, energy: 3, weightRecorded: false },
};
const adjusted = deterministicTodayBrief(lowerCapacity);
assert.equal(adjusted.nextAction, base.experiment?.minimumVersion, "a lower-capacity check-in should select the saved minimum version");
assert.match(adjusted.noticed, /sleep quality and energy/i);
assert.equal(shouldGenerateTodayBrief(lowerCapacity), false, "the deterministic adjustment should not require a model call");
assert.match(todayBriefGrounding(lowerCapacity, "fallback").sourceLabel, /Today's check-in/i);

const urgent: TodayBriefContext = {
  ...lowerCapacity,
  blueprint: { ...lowerCapacity.blueprint!, urgentSafetyInterruption: true },
};
assert.equal(deterministicTodayBrief(urgent).primaryAction, "open_blueprint", "safety must outrank a lifestyle adjustment");

const reviewDue: TodayBriefContext = { ...lowerCapacity, reviewDue: true };
assert.equal(deterministicTodayBrief(reviewDue).primaryAction, "open_review", "weekly review must outrank a lifestyle adjustment");

console.log("PR133 Today listens-first behavioral assertions passed.");
