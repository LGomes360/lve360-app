import assert from "node:assert/strict";

import {
  assessCoachAnswerQuality,
  classifyCoachIntent,
  coachSafetyBoundary,
  isCoachAnswerSafe,
  parseStructuredCoachAnswer,
  type StructuredCoachAnswer,
} from "../lib/contextualCoach.ts";
import { evaluateSafetyCandidates } from "../lib/safetyEngine.ts";

const sleepAnswer = JSON.stringify({
  intent: "GENERAL_EDUCATION",
  direct_answer: "Magnesium, glycine, melatonin, and L-theanine are used for different sleep goals rather than as interchangeable sleep aids.",
  options: [
    { name: "Magnesium Glycinate", fit: "neutral", reason: "A possible fit when magnesium intake is low, although sleep evidence is mixed." },
    { name: "Glycine", fit: "strong", reason: "An emerging option for sleep quality and next-day tiredness." },
  ],
  recommendation: null,
  next_step: "Choose the sleep problem you want to solve before comparing the top two options.",
  source_ids: ["evidence_magnesium_glycinate", "evidence_glycine", "invented"],
});
const parsed = parseStructuredCoachAnswer(
  sleepAnswer,
  "GENERAL_EDUCATION",
  new Set(["evidence_magnesium_glycinate", "evidence_glycine"]),
  new Set(["magnesium glycinate", "glycine"]),
);
assert.ok(parsed, "Scenario 1: general education must accept concrete, evidence-bound options.");
assert.equal(parsed.options.length, 2);
assert.deepEqual(parsed.sourceIds, ["evidence_magnesium_glycinate", "evidence_glycine"]);

const personalized: StructuredCoachAnswer = {
  intent: "PERSONALIZED_RECOMMENDATION",
  directAnswer: "Your recent sleep scores and current Routine make one carefully chosen experiment more useful than a larger supplement list.",
  options: [{ name: "Glycine", fit: "strong", reason: "It does not duplicate the supplied Routine and fits the stated sleep-quality goal." }],
  recommendation: { candidate: "Glycine", reason: "It fits the recorded goal without duplicating the current stack.", trialPeriodDays: 14, metrics: ["sleep quality", "morning energy"] },
  nextStep: "Try only one change and track sleep quality and morning energy for 14 days.",
  sourceIds: ["current_routine", "recent_check_ins", "evidence_glycine"],
};
const personalizedQuality = assessCoachAnswerQuality({ answer: personalized, supplementQuestion: true, safetyChecked: true, usedMemberContext: true });
assert.equal(personalizedQuality.passed, true, "Scenario 2: a personalized, safe, actionable answer should pass.");

const duplicateEvaluation = evaluateSafetyCandidates(
  {},
  [{ name: "Magnesium Glycinate", is_current: false }, { name: "Magnesium Glycinate", is_current: true }],
  { interactions: [{ ingredient: "Magnesium Glycinate" }], rules: [] },
);
assert.equal(duplicateEvaluation.candidates.length, 1, "Scenario 3: duplicate identities must collapse.");
assert.equal(duplicateEvaluation.candidates[0].isCurrent, true, "Scenario 3: the existing Routine item must win deduplication.");

const interactionEvaluation = evaluateSafetyCandidates(
  { medications: ["Warfarin"] },
  [{ name: "Omega-3", is_current: false }],
  { interactions: [{ ingredient: "Omega-3", anticoagulants_bleeding_risk: true }], rules: [] },
);
assert.equal(interactionEvaluation.candidates[0].decision, "blocked", "Scenario 4: deterministic safety must veto a high-severity interaction.");

const missingDataButUseful: StructuredCoachAnswer = {
  intent: "PERSONALIZED_RECOMMENDATION",
  directAnswer: "There are still useful general options to compare even though the saved record does not identify the exact sleep problem.",
  options: [{ name: "Melatonin", fit: "neutral", reason: "It is more relevant to sleep timing than to every form of poor sleep." }],
  recommendation: null,
  nextStep: "Clarify whether the main issue is falling asleep, staying asleep, or sleep timing.",
  sourceIds: ["evidence_melatonin"],
};
assert.equal(assessCoachAnswerQuality({ answer: missingDataButUseful, supplementQuestion: true, safetyChecked: true, usedMemberContext: false }).passed, true, "Scenario 5: missing user data must not force an abstention.");

assert.equal(classifyCoachIntent("What supplements am I currently taking at night?"), "SUPPLEMENT_LOOKUP", "Scenario 6: current-plan lookup must stay record-based and type-specific.");
assert.equal(classifyCoachIntent("Add glycine to my stack."), "REQUEST_TO_CHANGE_RECORD", "Scenario 7: mutation language must enter the controlled workflow.");
assert.equal(coachSafetyBoundary("Add glycine to my stack."), null, "Scenario 7: discussing a supplement record request must not be mistaken for a prescribed-plan change.");
assert.equal(classifyCoachIntent("I have chest pain and can't breathe"), "POTENTIAL_MEDICAL_RED_FLAG", "Scenario 8: a serious issue must stop normal coaching.");
assert.equal(coachSafetyBoundary("I have chest pain and can't breathe"), "emergency");
assert.equal(classifyCoachIntent("My tongue is swelling after taking this"), "POTENTIAL_MEDICAL_RED_FLAG");
assert.equal(isCoachAnswerSafe("You should increase your prescribed thyroid medication."), false);
assert.equal(isCoachAnswerSafe("Magnesium is absolutely safe and has no risk."), false);
assert.equal(parseStructuredCoachAnswer(
  JSON.stringify({
    intent: "GENERAL_EDUCATION",
    direct_answer: "A fabricated citation is https://example.com/fake-study.",
    options: [], recommendation: null, next_step: "Use that invented source.", source_ids: [],
  }),
  "GENERAL_EDUCATION", new Set(), new Set(),
), null, "Free-form or fabricated citations must be rejected rather than shown.");

const recordOnlyFailure = assessCoachAnswerQuality({
  answer: {
    intent: "GENERAL_EDUCATION",
    directAnswer: "Your Blueprint does not specify which supplements are good for sleep.",
    options: [], recommendation: null,
    nextStep: "Talk to a professional.", sourceIds: [],
  },
  supplementQuestion: true, safetyChecked: true, usedMemberContext: false,
});
assert.equal(recordOnlyFailure.passed, false, "The concrete production failure must be rejected by the quality gate.");

console.log("PR107 coaching engine acceptance scenarios passed.");
