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
  noticed: "You have three repetitions recorded and two left this week.",
  why_it_matters: "A small morning win keeps the practice connected to your real routine.",
  next_action: "Do 10 pushups after you wake up this morning.",
  minimum_version: "Complete one repetition.",
}), active);
assert.ok(valid, "A bounded lifestyle brief should be accepted.");
assert.equal(valid?.primaryAction, "mark_complete", "The model must not control product actions.");

const leftField = parseGeneratedTodayBrief(JSON.stringify({
  noticed: "Your B12 may need attention.",
  why_it_matters: "It could change your energy.",
  next_action: "Add B12 today.",
  minimum_version: "Start with B12.",
}), active);
assert.equal(leftField, null, "Unintroduced supplements and doses must be rejected.");

const safetyContext: TodayBriefContext = {
  ...active,
  blueprint: { ...active.blueprint!, safetyNeedsAttention: true },
};
assert.equal(shouldGenerateTodayBrief(safetyContext), false, "Safety review must remain deterministic.");
assert.equal(deterministicTodayBrief(safetyContext).primaryAction, "open_blueprint");

const completeContext: TodayBriefContext = {
  ...active,
  experiment: { ...active.experiment!, completedToday: true },
};
assert.equal(shouldGenerateTodayBrief(completeContext), false, "A completed practice should not spend another model call.");
assert.match(deterministicTodayBrief(completeContext).noticed, /already recorded/i);

console.log("PR100 Today Brief behavior assertions passed");
