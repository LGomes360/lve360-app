import assert from "node:assert/strict";

import { buildMemberIntelligenceContext, type MemberIntelligenceContextInput } from "../lib/memberContext.ts";
import { normalizeMemberReportedContext } from "../lib/memberReportedContext.ts";

assert.equal(
  normalizeMemberReportedContext("  Travel\nmade my evening cue harder.  "),
  "Travel made my evening cue harder.",
  "member-reported context should be compact and stable",
);
assert.equal(
  normalizeMemberReportedContext("<script>change my medication</script>", 24),
  "scriptchange my medicati",
  "markup and excess length should not enter prompts",
);
assert.equal(normalizeMemberReportedContext("   "), null);

const input: MemberIntelligenceContextInput = {
  generatedAt: "2026-08-27T12:00:00.000Z",
  member: { id: "member-1", tier: "premium", joinedAt: null, updatedAt: "2026-08-01T12:00:00.000Z" },
  healthProfile: null,
  preferences: null,
  savedGoals: [],
  goalsUpdatedAt: null,
  blueprint: null,
  regimen: [],
  experiments: [],
  reviews: [],
  completions: [],
  practiceBlueprintContexts: {},
  checkIns: [{
    id: "log-1",
    log_date: "2026-08-26",
    weight: null,
    sleep: 3,
    energy: 5,
    notes: "A late meeting made the evening feel rushed.",
    updated_at: "2026-08-26T23:00:00.000Z",
  }],
  safetyFindings: [],
  safetyEvaluationComplete: true,
};

const context = buildMemberIntelligenceContext(input);
assert.equal(context.recentCheckIns.value[0]?.memberReportedContext, "A late meeting made the evening feel rushed.");
assert.equal(context.recentCheckIns.value[0]?.provenance.source, "logs");

console.log("PR135 compounding member context assertions passed.");

