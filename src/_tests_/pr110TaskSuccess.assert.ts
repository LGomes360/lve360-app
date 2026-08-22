import assert from "node:assert/strict";

import { deterministicCoachTask } from "../lib/coachIntent.ts";
import { validateCoachTaskSuccess } from "../lib/coachTaskValidation.ts";
import {
  classifyCoachRequest,
  type CoachRoutingDecision,
  type StructuredCoachAnswer,
} from "../lib/contextualCoach.ts";
import type { CurrentRegimenItem, CurrentRegimenKind } from "../lib/currentRegimenModel.ts";
import {
  buildMemberIntelligenceContext,
  type MemberIntelligenceContextInput,
} from "../lib/memberContext.ts";

const NOW = "2026-08-14T12:00:00.000Z";

function regimenItem(index: number, kind: CurrentRegimenKind, overrides: Partial<CurrentRegimenItem> = {}): CurrentRegimenItem {
  const name = overrides.name ?? `${kind} ${index}`;
  return {
    id: `regimen-${index}`,
    user_id: "member-1",
    source_submission_id: "submission-1",
    source_stack_item_id: null,
    item_kind: kind,
    name,
    normalized_name: name.toLowerCase(),
    purpose: null,
    dose: null,
    timing: null,
    brand: null,
    reorder_url: null,
    image_url: null,
    product_source: null,
    product_sku: null,
    instruction_source: "intake",
    instruction_authority: null,
    schedule: null,
    active: true,
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-13T12:00:00.000Z",
    ...overrides,
  };
}

function memberInput(): MemberIntelligenceContextInput {
  return {
    generatedAt: NOW,
    member: { id: "member-1", tier: "premium", joinedAt: "2026-07-01T12:00:00.000Z", updatedAt: NOW },
    healthProfile: {
      submissionId: "submission-1",
      updatedAt: NOW,
      age: 52,
      sex: "male",
      conditions: ["Hypertension"],
      allergies: [],
      procedures: [],
      pregnant: null,
      dosingPreference: null,
      brandPreference: null,
    },
    preferences: {
      preferredName: "Luke",
      weightUnit: "lb",
      reminderPreference: "email",
      timezone: "America/Denver",
      cueHour: 6,
      quietStartHour: 21,
      quietEndHour: 5,
      updatedAt: NOW,
    },
    savedGoals: [{
      label: "Improve sleep and energy",
      kind: "named",
      targetValue: null,
      provenance: { source: "goals", recordId: "goal-1", updatedAt: NOW },
    }],
    goalsUpdatedAt: NOW,
    blueprint: {
      stack_id: "stack-1",
      created_at: "2026-08-10T12:00:00.000Z",
      goals: ["Improve sleep and energy"],
      safety_status: "review",
      safety_acknowledged: false,
      needs_refresh: false,
      priorities: [{ id: "priority-1", label: "Keep a consistent wake time", category: "sleep", kind: "lifestyle" }],
    },
    regimen: [
      regimenItem(1, "medication", { name: "Zepbound", dose: "10 mg/0.5 mL", timing: "Sunday morning" }),
      regimenItem(2, "medication", { name: "Lisinopril", dose: "10 mg", timing: "morning" }),
      regimenItem(3, "hormone", { name: "Testosterone cypionate", dose: "80 mg", timing: "twice weekly" }),
      regimenItem(4, "supplement", { name: "Magnesium glycinate", dose: "200 mg", timing: "evening" }),
      regimenItem(5, "endocrine_active_supplement", { name: "DHEA" }),
    ],
    experiments: [{
      id: "experiment-1",
      source_stack_id: "stack-1",
      source_action_id: "priority-1",
      identity_direction: "sleep",
      action_label: "Keep a consistent wake time",
      cue: "After my alarm",
      frequency_per_week: 5,
      minimum_version: "Get out of bed at the planned time",
      status: "active",
      week_start: "2026-08-10",
      created_at: "2026-08-10T12:00:00.000Z",
      updated_at: NOW,
    }],
    reviews: [],
    completions: [{ id: "completion-1", experiment_id: "experiment-1", completion_date: "2026-08-12", completion_kind: "full", updated_at: NOW }],
    practiceBlueprintContexts: {
      "experiment-1": {
        source_stack_id: "stack-1",
        source_action_id: "priority-1",
        priority_label: "Keep a consistent wake time",
        priority_category: "sleep",
        priority_kind: "lifestyle",
        blueprint_created_at: "2026-08-10T12:00:00.000Z",
        is_current_blueprint: true,
        needs_review: false,
      },
    },
    checkIns: [{ id: "log-1", log_date: "2026-08-13", weight: 200, sleep: 2, energy: 5, updated_at: NOW }],
    safetyFindings: [{
      code: "interaction_anticoagulant",
      item: "Omega-3",
      message: "Review possible additive bleeding risk with the recorded anticoagulant.",
      severity: "danger",
      decision: "blocked",
      source: "interactions",
      sourceUrl: "https://example.com/source",
    }],
    safetyEvaluationComplete: true,
  };
}

const context = buildMemberIntelligenceContext(memberInput());

function validate(route: CoachRoutingDecision, question: string, answerText: string, structuredAnswer: StructuredCoachAnswer | null = null, evidenceOptionNames: string[] = []) {
  return validateCoachTaskSuccess({
    route,
    question,
    answerText,
    structuredAnswer,
    evidenceOptionNames,
    memberContext: context,
    safetyChecked: true,
  });
}

function deterministicPass(question: string) {
  const route = classifyCoachRequest(question);
  const answer = deterministicCoachTask(route, context, question);
  assert.ok(answer, `Expected a deterministic task for: ${question}`);
  const report = validate(route, question, answer.answer);
  assert.equal(report.passed, true, `Expected golden task to pass: ${question}\n${JSON.stringify(report, null, 2)}`);
  assert.equal(report.score, 100, `A complete deterministic task should retain a measurable 100 score: ${question}`);
  return { route, answer, report };
}

const regimenQuestion = "What medications and hormones do I currently have saved, including doses and timing?";
const regimen = deterministicPass(regimenQuestion);
const wrongRegimen = validate(
  regimen.route,
  regimenQuestion,
  "Your current medication is Magnesium glycinate, 200 mg in the evening. Next step: keep taking it.",
);
assert.equal(wrongRegimen.passed, false);
assert.notEqual(wrongRegimen.score, 100, "A wrong medication lookup can never receive a perfect score.");
assert(wrongRegimen.failedValidators.includes("REGIMEN_COVERAGE"));
assert(wrongRegimen.failedValidators.includes("TYPE_EXCLUSIONS"));

const safetyQuestion = "Which items in my current routine need clinician or pharmacist review, and why?";
const safety = deterministicPass(safetyQuestion);
const wrongSafety = validate(safety.route, safetyQuestion, "Everything looks fine. No review is needed.");
assert.equal(wrongSafety.passed, false);
assert(wrongSafety.failedValidators.includes("SAFETY_FINDINGS"));
assert(wrongSafety.failedValidators.includes("SAFETY_REASONING"));

const priorityQuestion = "Based on my saved goals, recent check-ins, and active weekly practice, what is the highest-value action I should focus on this week?";
const priority = deterministicPass(priorityQuestion);
const wrongPriority = validate(priority.route, priorityQuestion, "Add magnesium this week because it may support sleep.");
assert.equal(wrongPriority.passed, false);
assert(wrongPriority.failedValidators.includes("PRIORITY_ALIGNMENT"));

const behaviorQuestion = "I slept poorly last night. How should I adjust tomorrow without changing my medications or supplements?";
const behavior = deterministicPass(behaviorQuestion);
const wrongBehavior = validate(
  behavior.route,
  behaviorQuestion,
  "Tomorrow, increase Zepbound and add Magnesium glycinate. This should improve sleep.",
);
assert.equal(wrongBehavior.passed, false);
assert(wrongBehavior.failedValidators.includes("CONSTRAINT_ADHERENCE"));
assert.deepEqual(
  [...wrongBehavior.constraintViolations].sort(),
  ["preserve_medication_plan", "preserve_supplement_plan"],
  "Every explicit preserve-plan constraint must be enforced independently.",
);

const missingQuestion = "What important information is missing from my profile that would make your recommendations better?";
const missing = deterministicPass(missingQuestion);
const wrongMissing = validate(missing.route, missingQuestion, "Your health profile and goals are missing. Add those first.");
assert.equal(wrongMissing.passed, false);
assert(wrongMissing.failedValidators.includes("MISSING_CONTEXT_ACCURACY"));
assert(wrongMissing.constraintViolations.includes("existing_health_profile_labeled_missing"));
assert(wrongMissing.constraintViolations.includes("existing_goals_labeled_missing"));

const outsideQuestion = "What is the capital of France?";
const outside = deterministicPass(outsideQuestion);
const wrongOutside = validate(outside.route, outsideQuestion, "The capital of France is Paris.");
assert.equal(wrongOutside.passed, false);
assert(wrongOutside.failedValidators.includes("OUT_OF_SCOPE_BOUNDARY"));

const progressQuestion = "What pattern do my sleep and energy check-ins show this week?";
const progressRoute = classifyCoachRequest(progressQuestion);
assert.equal(progressRoute.intent, "PROGRESS_COACHING");
const goodProgress = validate(
  progressRoute,
  progressQuestion,
  "Your recent sleep and energy check-ins are observations, not proof that one habit caused the pattern. Keep a consistent wake time this week and continue recording both metrics.",
);
assert.equal(goodProgress.passed, true);
const wrongProgress = validate(progressRoute, progressQuestion, "Your sleep proves the supplement worked.");
assert.equal(wrongProgress.passed, false);
assert(wrongProgress.failedValidators.includes("PROGRESS_METRICS"));
assert(wrongProgress.failedValidators.includes("CAUSAL_BOUNDARY"));

const nextWeekQuestion = "I want a small movement habit after lunch. What should I practice next week?";
const nextWeekRoute = classifyCoachRequest(nextWeekQuestion);
assert.equal(nextWeekRoute.intent, "PROGRESS_COACHING");
const nextWeekAnswer: StructuredCoachAnswer = {
  intent: "PROGRESS_COACHING",
  directAnswer: "A short walk after lunch is a practical next-week experiment for your energy goal.",
  options: [],
  recommendation: null,
  nextStep: "Preview the practice before deciding whether to save it for next week.",
  sourceIds: ["weekly_practice", "goals"],
  proposedAction: {
    type: "weekly_practice",
    identityDirection: "movement",
    actionLabel: "Take a 10-minute walk after lunch",
    cue: "After lunch",
    frequencyPerWeek: 5,
    minimumVersion: "Walk for two minutes",
    rationale: "This connects movement to a reliable meal cue.",
  },
};
const goodNextWeek = validate(
  nextWeekRoute,
  nextWeekQuestion,
  `${nextWeekAnswer.directAnswer} ${nextWeekAnswer.nextStep}`,
  nextWeekAnswer,
);
assert.equal(goodNextWeek.passed, true, JSON.stringify(goodNextWeek, null, 2));
const missingNextWeekProposal = validate(
  nextWeekRoute,
  nextWeekQuestion,
  `${nextWeekAnswer.directAnswer} ${nextWeekAnswer.nextStep}`,
  { ...nextWeekAnswer, proposedAction: null },
);
assert.equal(missingNextWeekProposal.passed, false);
assert(missingNextWeekProposal.failedValidators.includes("CONTROLLED_ACTION_PROPOSAL"));

const exactFailedNextWeekQuestion = "Suggest one small next-week movement practice after lunch. Keep my medications, hormones, supplements, and current Routine unchanged.";
const exactFailedNextWeekRoute = classifyCoachRequest(exactFailedNextWeekQuestion);
const repairedNextWeekValidation = validate(
  exactFailedNextWeekRoute,
  exactFailedNextWeekQuestion,
  `${nextWeekAnswer.directAnswer} ${nextWeekAnswer.nextStep}`,
  nextWeekAnswer,
);
assert.equal(
  repairedNextWeekValidation.passed,
  true,
  `The exact Preview request must use controlled-action validation instead of requiring the current practice.\n${JSON.stringify(repairedNextWeekValidation, null, 2)}`,
);
assert(!repairedNextWeekValidation.failedValidators.includes("ACTIVE_PRACTICE_USE"));

const comparisonQuestion = "Compare glycine and melatonin for my sleep goal.";
const comparisonRoute = classifyCoachRequest(comparisonQuestion);
assert.equal(comparisonRoute.intent, "EVIDENCE_COMPARISON");
const comparisonAnswer: StructuredCoachAnswer = {
  intent: "EVIDENCE_COMPARISON",
  directAnswer: "Both options can be compared, but they fit different sleep problems.",
  options: [
    { name: "Glycine", fit: "strong", reason: "It may fit sleep quality and next-day tiredness." },
    { name: "Melatonin", fit: "neutral", reason: "It is more directly relevant to sleep timing." },
  ],
  recommendation: null,
  nextStep: "Choose one outcome to track before selecting an option.",
  sourceIds: ["evidence_glycine", "evidence_melatonin"],
};
const goodComparison = validate(comparisonRoute, comparisonQuestion, `${comparisonAnswer.directAnswer} ${comparisonAnswer.options.map((item) => item.reason).join(" ")} ${comparisonAnswer.nextStep}`, comparisonAnswer, ["Glycine", "Melatonin"]);
assert.equal(goodComparison.passed, true);
const wrongComparison = validate(comparisonRoute, comparisonQuestion, "Magnesium is best. Try it.", null, ["Glycine", "Melatonin"]);
assert.equal(wrongComparison.passed, false);
assert(wrongComparison.failedValidators.includes("EVIDENCE_COVERAGE"));

const personalizedQuestion = "What supplement makes sense for me for my sleep and energy goal?";
const personalizedRoute = classifyCoachRequest(personalizedQuestion);
assert.equal(personalizedRoute.intent, "PERSONALIZED_RECOMMENDATION");
const personalizedAnswer: StructuredCoachAnswer = {
  intent: "PERSONALIZED_RECOMMENDATION",
  directAnswer: "Glycine is the more relevant option for your recorded goal to improve sleep and energy.",
  options: [{ name: "Glycine", fit: "strong", reason: "It may fit sleep quality and next-day tiredness." }],
  recommendation: { candidate: "Glycine", reason: "It matches the recorded sleep goal.", trialPeriodDays: 14, metrics: ["sleep quality", "energy"] },
  nextStep: "Track sleep quality and energy for 14 days before deciding whether it helped.",
  sourceIds: ["goals", "evidence_glycine"],
};
const goodPersonalized = validate(personalizedRoute, personalizedQuestion, `${personalizedAnswer.directAnswer} ${personalizedAnswer.options[0].reason} ${personalizedAnswer.nextStep}`, personalizedAnswer, ["Glycine"]);
assert.equal(goodPersonalized.passed, true);
const genericPersonalized: StructuredCoachAnswer = {
  ...personalizedAnswer,
  directAnswer: "This option has a plausible general wellness rationale and may be worth considering.",
  sourceIds: ["evidence_glycine"],
};
const wrongPersonalized = validate(personalizedRoute, personalizedQuestion, `${genericPersonalized.directAnswer} ${genericPersonalized.options[0].reason} ${genericPersonalized.nextStep}`, genericPersonalized, ["Glycine"]);
assert.equal(wrongPersonalized.passed, false);
assert(wrongPersonalized.failedValidators.includes("MEMBER_CONTEXT_USE"));

const malformed = validate(comparisonRoute, comparisonQuestion, "{\"answer\":\"looks valid\"}", null, ["Glycine", "Melatonin"]);
assert.equal(malformed.passed, false);
assert(malformed.failedValidators.includes("STRUCTURE"));

console.log("PR110 task-success validation scenarios passed.");
