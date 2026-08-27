import assert from "node:assert/strict";

import { classifyCoachRequest, type StructuredCoachAnswer } from "../lib/contextualCoach.ts";
import { validateCoachTaskSuccess } from "../lib/coachTaskValidation.ts";
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

const contextualQuestion = "Using my saved check-in context, suggest one small way to protect what worked when my day gets busy.";
const contextualRoute = classifyCoachRequest(contextualQuestion);
assert.equal(
  contextualRoute.intent,
  "PERSONALIZED_RECOMMENDATION",
  "an explicit request to use a saved check-in must not collapse into generic progress coaching",
);

const groundedAnswer: StructuredCoachAnswer = {
  intent: "PERSONALIZED_RECOMMENDATION",
  directAnswer: "You recorded that a late meeting made the evening feel rushed, so protect a two-minute transition before the meeting.",
  options: [],
  recommendation: null,
  nextStep: "Pause for two minutes before the meeting and note whether the evening feels less rushed.",
  sourceIds: ["recent_check_ins"],
  proposedAction: null,
};
const groundedValidation = validateCoachTaskSuccess({
  route: contextualRoute,
  question: contextualQuestion,
  answerText: `${groundedAnswer.directAnswer} ${groundedAnswer.nextStep}`,
  memberContext: context,
  structuredAnswer: groundedAnswer,
  evidenceOptionNames: [],
  safetyChecked: true,
});
assert.equal(groundedValidation.passed, true, "a cautious answer that uses the recorded detail should pass");

const genericValidation = validateCoachTaskSuccess({
  route: contextualRoute,
  question: contextualQuestion,
  answerText: "Try taking a short break. Next step: pause for two minutes.",
  memberContext: context,
  structuredAnswer: { ...groundedAnswer, directAnswer: "Try taking a short break.", sourceIds: [] },
  evidenceOptionNames: [],
  safetyChecked: true,
});
assert.equal(genericValidation.passed, false, "a generic answer that ignores the saved note should fail");
assert(genericValidation.failedValidators.includes("MEMBER_REPORTED_CONTEXT_USE"));

const unattributedValidation = validateCoachTaskSuccess({
  route: contextualRoute,
  question: contextualQuestion,
  answerText: "A late meeting can make the evening feel rushed. Next step: protect a two-minute transition before the meeting.",
  memberContext: context,
  structuredAnswer: { ...groundedAnswer, directAnswer: "A late meeting can make the evening feel rushed." },
  evidenceOptionNames: [],
  safetyChecked: true,
});
assert.equal(unattributedValidation.passed, false, "the answer must label the detail as member-reported rather than objective fact");
assert(unattributedValidation.missingRequirements.includes("member_reported_context_not_attributed"));

console.log("PR135 compounding member context assertions passed.");
