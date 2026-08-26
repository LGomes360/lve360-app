import assert from "node:assert/strict";

import {
  deterministicTodayBrief,
  parseGeneratedTodayBrief,
  todayBriefGrounding,
  type TodayBriefContext,
} from "../lib/todayBrief.ts";

const connected: TodayBriefContext = {
  localDate: "2026-08-24",
  experiment: {
    id: "11111111-1111-4111-8111-111111111111",
    identity: "Someone who moves consistently",
    actionLabel: "Take a 10-minute walk after lunch",
    cue: "finish lunch",
    minimumVersion: "Walk for two minutes",
    target: 4,
    completed: 2,
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

const fallback = deterministicTodayBrief(connected);
assert.match(fallback.noticed, /2 of 4 planned times/i, "the observed fact must come from recorded completion data");
assert.doesNotMatch(fallback.whyItMatters, /Improve daily energy/i, "timing rationale must not duplicate the separate personal connection");
assert.equal(fallback.nextAction, connected.experiment?.actionLabel, "the saved practice remains the authoritative action");
assert.equal(fallback.minimumVersion, connected.experiment?.minimumVersion, "the saved hard-day version remains authoritative");

const generated = parseGeneratedTodayBrief(JSON.stringify({
  noticed: "You completed ten practices this week.",
  why_it_matters: "A useful session today keeps the saved week moving without adding another goal.",
}), connected);
assert.ok(generated);
assert.equal(generated?.noticed, fallback.noticed, "AI wording must not replace the deterministic observed fact");

assert.deepEqual(todayBriefGrounding(connected, "ai"), {
  confidence: "direct_record",
  confidenceLabel: "Direct record match",
  sourceLabel: "Saved practice, recorded progress, and bounded AI synthesis",
});

const independent: TodayBriefContext = {
  ...connected,
  experiment: {
    ...connected.experiment!,
    connectionSummary: "Independently chosen for this week",
  },
};
assert.equal(todayBriefGrounding(independent, "fallback").confidence, "limited_context", "an unlinked practice must disclose limited personal context");

const urgent: TodayBriefContext = {
  ...connected,
  blueprint: {
    ...connected.blueprint!,
    urgentSafetyInterruption: true,
  },
};
assert.equal(todayBriefGrounding(urgent, "fallback").sourceLabel, "Current Blueprint safety status");

console.log("PR128 Today decision-spine grounding assertions passed.");
