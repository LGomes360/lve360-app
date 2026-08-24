import assert from "node:assert/strict";

import { buildGroundedCoachFallback, type GroundedCoachFallbackInput } from "../lib/coachFallback.ts";

const base: GroundedCoachFallbackInput = {
  question: "What should I do?",
  intent: "GENERAL_EDUCATION",
  page: "today",
  availableSourceIds: ["weekly_practice", "current_routine", "current_blueprint", "evidence_magnesium"],
  missingContextLabels: [],
  routineCount: 8,
  evidenceOptions: [],
  activePractice: null,
  blueprintPriorities: [],
};

const progress = buildGroundedCoachFallback({
  ...base,
  intent: "PROGRESS_COACHING",
  question: "What should I do today?",
  activePractice: {
    actionLabel: "Walk after lunch",
    minimumVersion: "Walk for two minutes",
    completionCount: 3,
    frequencyPerWeek: 5,
  },
});
assert.match(progress.answer, /Walk after lunch/);
assert.match(progress.answer, /3 of 5 planned repetitions/);
assert.match(progress.answer, /Walk for two minutes/);
assert.match(progress.answer, /unchanged/);
assert.deepEqual(progress.sourceIds, ["weekly_practice"]);

const malformedPractice = buildGroundedCoachFallback({
  ...base,
  intent: "BEHAVIORAL_COACHING",
  activePractice: {
    actionLabel: "Wall sit for 1 minute.",
    minimumVersion: "Three times",
    completionCount: 0,
    frequencyPerWeek: 5,
  },
});
assert.doesNotMatch(malformedPractice.answer, /minute\.,/);
assert.doesNotMatch(malformedPractice.answer, /recorded minimum is Three times/i);
assert.match(malformedPractice.answer, /record a concrete hard-day version/);

const evidence = buildGroundedCoachFallback({
  ...base,
  intent: "PERSONALIZED_RECOMMENDATION",
  question: "Could this help my sleep?",
  evidenceOptions: [{ id: "evidence_magnesium", name: "Magnesium Glycinate" }],
});
assert.match(evidence.answer, /grounded LVE360 evidence for Magnesium Glycinate/);
assert.match(evidence.answer, /for sleep, without changing my Routine/);
assert.deepEqual(evidence.sourceIds, ["evidence_magnesium"]);

const comparison = buildGroundedCoachFallback({
  ...base,
  intent: "OPTION_COMPARISON",
  question: "Compare magnesium glycinate and glycine for sleep.",
  evidenceOptions: [
    { id: "evidence_magnesium", name: "Magnesium Glycinate" },
    { id: "evidence_glycine", name: "Glycine" },
  ],
  availableSourceIds: ["evidence_magnesium", "evidence_glycine"],
});
assert.match(comparison.answer, /reliable head-to-head comparison/);
assert.doesNotMatch(comparison.answer, /exact outcome and comparison needed/);
assert.deepEqual(comparison.sourceIds, ["evidence_magnesium", "evidence_glycine"]);

const missing = buildGroundedCoachFallback({
  ...base,
  intent: "MISSING_CONTEXT",
  missingContextLabels: ["Record at least one current goal.", "Record a few sleep, energy, or weight check-ins."],
});
assert.match(missing.answer, /most useful missing information/i);
assert.match(missing.answer, /Record at least one current goal/);
assert.match(missing.answer, /Then ask the same question again/);

const safety = buildGroundedCoachFallback({
  ...base,
  intent: "SAFETY_REVIEW",
  question: "Is this safe with my medication?",
});
assert.match(safety.answer, /exact item, recorded amount, timing, and complete safety context/);
assert.match(safety.answer, /clinician or healthcare provider/);
assert.match(safety.answer, /Keep medication and hormone instructions unchanged/);
assert.doesNotMatch(safety.answer, /pharmacist/i);

const safetyWithMissingProfile = buildGroundedCoachFallback({
  ...base,
  intent: "SAFETY_REVIEW",
  missingContextLabels: ["Complete the intake health profile."],
});
assert.match(safetyWithMissingProfile.answer, /Complete the intake health profile/);
assert.match(safetyWithMissingProfile.answer, /clinician or healthcare provider/);

const regimen = buildGroundedCoachFallback({
  ...base,
  intent: "CURRENT_REGIMEN_LOOKUP",
});
assert.match(regimen.answer, /8 current medication, hormone, and supplement records/);
assert.match(regimen.answer, /one record-only question/);
assert.doesNotMatch(regimen.answer, /\b(?:start|stop|increase|decrease)\b/i);

console.log("PR124 grounded coaching fallback assertions passed.");
