import assert from "node:assert/strict";

import {
  deterministicTodayBrief,
  parseGeneratedTodayBrief,
  shouldGenerateTodayBrief,
  type TodayBriefContext,
} from "../lib/todayBrief.ts";

const active: TodayBriefContext = {
  localDate: "2026-08-10",
  experiment: {
    id: "11111111-1111-4111-8111-111111111111",
    identity: "Someone who moves consistently",
    actionLabel: "Do 10 pushups in the morning",
    cue: "wake up",
    minimumVersion: "Complete one repetition",
    target: 5,
    completed: 3,
    completedToday: false,
  },
  blueprint: {
    stackId: "22222222-2222-4222-8222-222222222222",
    needsRefresh: false,
    safetyNeedsAttention: false,
  },
  reviewDue: false,
};

assert.equal(shouldGenerateTodayBrief(active), true);
assert.equal(deterministicTodayBrief(active).primaryAction, "mark_complete");

const valid = parseGeneratedTodayBrief(JSON.stringify({
  noticed: "You have three practice completions recorded and two left this week.",
  why_it_matters: "A small morning win keeps the practice connected to your real routine.",
}), active);
assert.ok(valid, "A bounded lifestyle brief should be accepted.");
assert.equal(valid?.primaryAction, "mark_complete", "The model must not control product actions.");
assert.equal(valid?.nextAction, active.experiment?.actionLabel, "The saved action must remain authoritative.");
assert.equal(valid?.minimumVersion, active.experiment?.minimumVersion, "The saved minimum version must remain authoritative.");

const leftField = parseGeneratedTodayBrief(JSON.stringify({
  noticed: "Your B12 may need attention.",
  why_it_matters: "It could change your energy.",
}), active);
assert.equal(leftField, null, "Unintroduced supplements and doses must be rejected.");

const discouraging = parseGeneratedTodayBrief(JSON.stringify({
  noticed: "You missed your practice despite a goal of five.",
  why_it_matters: "You should have done more by now.",
}), active);
assert.equal(discouraging, null, "Shaming or misframed progress language must fall back to deterministic copy.");

const safetyContext: TodayBriefContext = {
  ...active,
  blueprint: { ...active.blueprint!, safetyNeedsAttention: true },
};
assert.equal(shouldGenerateTodayBrief(safetyContext), true, "A normal acknowledged-or-reviewable warning must not suppress the useful lifestyle brief.");
assert.equal(deterministicTodayBrief(safetyContext).primaryAction, "mark_complete");

const urgentSafetyContext: TodayBriefContext = {
  ...safetyContext,
  blueprint: { ...safetyContext.blueprint!, urgentSafetyInterruption: true },
};
assert.equal(shouldGenerateTodayBrief(urgentSafetyContext), false, "An unavailable safety evaluation must remain deterministic.");
assert.equal(deterministicTodayBrief(urgentSafetyContext).primaryAction, "open_blueprint");

const completeContext: TodayBriefContext = {
  ...active,
  experiment: { ...active.experiment!, completedToday: true },
};
assert.equal(shouldGenerateTodayBrief(completeContext), false, "A completed practice should not spend another model call.");
assert.match(deterministicTodayBrief(completeContext).noticed, /already recorded/i);

console.log("PR100 Today Brief behavior assertions passed");
