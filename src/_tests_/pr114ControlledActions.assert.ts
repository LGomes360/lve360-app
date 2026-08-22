import assert from "node:assert/strict";

import { classifyCoachRequest, parseProposedWeeklyPractice, parseStructuredCoachAnswer } from "../lib/contextualCoach.ts";

const safeProposal = {
  type: "weekly_practice",
  identity_direction: "movement",
  action_label: "Take a 10-minute walk after lunch",
  cue: "After lunch",
  frequency_per_week: 5,
  minimum_version: "Walk for two minutes",
  rationale: "This connects movement to a reliable meal cue.",
};

assert.deepEqual(parseProposedWeeklyPractice(safeProposal, "BEHAVIORAL_COACHING"), {
  type: "weekly_practice",
  identityDirection: "movement",
  actionLabel: "Take a 10-minute walk after lunch",
  cue: "After lunch",
  frequencyPerWeek: 5,
  minimumVersion: "Walk for two minutes",
  rationale: "This connects movement to a reliable meal cue.",
});

assert.equal(parseProposedWeeklyPractice(safeProposal, "SAFETY_REVIEW"), null, "safety answers must not create tracked actions");
assert.equal(parseProposedWeeklyPractice({ ...safeProposal, action_label: "Increase my thyroid medication dose" }, "BEHAVIORAL_COACHING"), null);
assert.equal(parseProposedWeeklyPractice({ ...safeProposal, minimum_version: "Take one magnesium capsule" }, "PROGRESS_COACHING"), null);
assert.equal(parseProposedWeeklyPractice({ ...safeProposal, rationale: "Ask my pharmacist about the dose" }, "PRIORITIZATION"), null);
assert.equal(parseProposedWeeklyPractice({ ...safeProposal, frequency_per_week: 8 }, "BEHAVIORAL_COACHING"), null);

const parsed = parseStructuredCoachAnswer(JSON.stringify({
  intent: "BEHAVIORAL_COACHING",
  direct_answer: "A short walk after lunch is a practical next experiment.",
  options: [],
  recommendation: null,
  next_step: "Preview the practice before deciding whether to save it.",
  source_ids: ["weekly_practice"],
  proposed_action: safeProposal,
}), "BEHAVIORAL_COACHING", new Set(["weekly_practice"]), new Set());

assert.ok(parsed?.proposedAction);
assert.equal(parsed?.proposedAction?.actionLabel, "Take a 10-minute walk after lunch");

const recoveredShortNextStep = parseStructuredCoachAnswer(JSON.stringify({
  intent: "PROGRESS_COACHING",
  direct_answer: "A short walk after lunch is a practical next-week experiment.",
  options: [],
  recommendation: null,
  next_step: "",
  source_ids: ["weekly_practice"],
  proposed_action: safeProposal,
}), "PROGRESS_COACHING", new Set(["weekly_practice"]), new Set());

assert.equal(
  recoveredShortNextStep?.nextStep,
  "Preview this practice before deciding whether to save it for next week.",
  "a safe controlled-action proposal must not be discarded only because the model omitted the Preview instruction",
);
assert.equal(recoveredShortNextStep?.proposedAction?.actionLabel, "Take a 10-minute walk after lunch");

const rejectedShortNextStepWithoutProposal = parseStructuredCoachAnswer(JSON.stringify({
  intent: "PROGRESS_COACHING",
  direct_answer: "Your current weekly practice remains available for review.",
  options: [],
  recommendation: null,
  next_step: "",
  source_ids: ["weekly_practice"],
  proposed_action: null,
}), "PROGRESS_COACHING", new Set(["weekly_practice"]), new Set());
assert.equal(rejectedShortNextStepWithoutProposal, null, "short next steps must still fail closed when no safe action proposal exists");

const compatibleIntentDrift = parseStructuredCoachAnswer(JSON.stringify({
  intent: "BEHAVIORAL_COACHING",
  direct_answer: "A short walk after lunch is a practical next-week experiment.",
  options: [],
  recommendation: null,
  next_step: "Preview the practice before deciding whether to save it.",
  source_ids: ["weekly_practice"],
  proposed_action: safeProposal,
}), "PROGRESS_COACHING", new Set(["weekly_practice"]), new Set());

assert.equal(compatibleIntentDrift?.intent, "PROGRESS_COACHING");
assert.equal(compatibleIntentDrift?.proposedAction?.actionLabel, "Take a 10-minute walk after lunch");

const serverIntentWins = parseStructuredCoachAnswer(JSON.stringify({
  intent: "SAFETY_REVIEW",
  direct_answer: "A short walk after lunch is a practical next-week experiment.",
  options: [],
  recommendation: null,
  next_step: "Preview the practice before deciding whether to save it.",
  source_ids: ["weekly_practice"],
  proposed_action: safeProposal,
}), "PROGRESS_COACHING", new Set(["weekly_practice"]), new Set());

assert.equal(serverIntentWins?.intent, "PROGRESS_COACHING", "the server-classified intent must remain authoritative");
assert.ok(serverIntentWins?.proposedAction, "safe action parsing must use the server-classified intent");

assert.equal(
  classifyCoachRequest("I want to improve my energy with a small movement habit after lunch. What should I practice next week?").intent,
  "PROGRESS_COACHING",
  "explicit next-week practice requests must be eligible for a controlled action preview",
);

const failedPreviewRoute = classifyCoachRequest(
  "Suggest one small next-week movement practice after lunch. Keep my medications, hormones, supplements, and current Routine unchanged.",
);
assert.equal(failedPreviewRoute.intent, "PROGRESS_COACHING", "hyphenated next-week wording must be eligible for a controlled action preview");
assert.equal(failedPreviewRoute.constraints.preserveMedicationPlan, true);
assert.equal(failedPreviewRoute.constraints.preserveHormonePlan, true);
assert.equal(failedPreviewRoute.constraints.preserveSupplementPlan, true);

console.log("PR114 controlled action validation assertions passed.");
