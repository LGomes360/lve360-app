import assert from "node:assert/strict";

import {
  todayRecommendationGrounding,
  type TodayBriefContext,
} from "../lib/todayBrief.ts";

const connected: TodayBriefContext = {
  localDate: "2026-08-27",
  experiment: {
    id: "11111111-1111-4111-8111-111111111111",
    identity: "Someone who moves consistently",
    actionLabel: "Take a 10-minute walk after lunch",
    cue: "finish lunch",
    minimumVersion: "Walk for two minutes",
    target: 4,
    completed: 2,
    completedToday: false,
    connectionSummary: "Supports saved goal: Improve daily energy · Supports Blueprint priority: Move consistently",
    connection: {
      type: "both",
      goal: { label: "Improve daily energy", status: "current" },
      blueprint: { label: "Move consistently", status: "current" },
    },
  },
  blueprint: {
    stackId: "22222222-2222-4222-8222-222222222222",
    needsRefresh: false,
    safetyNeedsAttention: false,
  },
  checkIn: {
    sleep: 4,
    energy: 8,
    weightRecorded: true,
    memberReportedContext: "A member-reported reflection that must not be repeated.",
  },
  reviewDue: false,
};

const grounded = todayRecommendationGrounding(connected, "ai");
assert.equal(grounded.title, "Why LVE360 chose this today");
assert.equal(grounded.confidenceLabel, "Direct record match");
assert.match(grounded.summary, /saved practice remains the action/i);
assert.deepEqual(grounded.sources.map((source) => source.kind), [
  "weekly_practice",
  "saved_goal",
  "blueprint",
  "check_in",
]);
assert.match(grounded.sources[0]?.detail ?? "", /2 of 4 planned sessions recorded/i);
assert.equal(grounded.sources[2]?.href, "/blueprints/22222222-2222-4222-8222-222222222222");
assert.match(grounded.sources[3]?.detail ?? "", /sleep quality 4\/5/i);
assert.match(grounded.sources[3]?.detail ?? "", /optional reflection available/i);
assert.doesNotMatch(grounded.sources[3]?.detail ?? "", /must not be repeated/i);
assert.match(grounded.methodNote, /AI only shaped the short explanation/i);

const lowerCapacity: TodayBriefContext = {
  ...connected,
  checkIn: { sleep: 2, energy: 3, weightRecorded: false, memberReportedContext: null },
};
assert.match(todayRecommendationGrounding(lowerCapacity, "fallback").summary, /selected your saved minimum version/i);

const urgent: TodayBriefContext = {
  ...connected,
  blueprint: { ...connected.blueprint!, urgentSafetyInterruption: true },
};
const urgentGrounding = todayRecommendationGrounding(urgent, "fallback");
assert.equal(urgentGrounding.sources[0]?.kind, "safety");
assert.equal(urgentGrounding.sources[0]?.status, "needs_review");
assert.match(urgentGrounding.sources[0]?.href ?? "", /#safety-notes$/);

const independent: TodayBriefContext = {
  ...connected,
  experiment: {
    ...connected.experiment!,
    connectionSummary: "Independently chosen for this week",
    connection: { type: "independent", goal: null, blueprint: null },
  },
  checkIn: null,
};
assert.deepEqual(todayRecommendationGrounding(independent, "fallback").sources.map((source) => source.kind), ["weekly_practice"]);
assert.equal(todayRecommendationGrounding(independent, "fallback").confidenceLabel, "Limited personal context");

console.log("PR142 Today grounding assertions passed.");
