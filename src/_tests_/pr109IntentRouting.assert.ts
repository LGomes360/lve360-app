import assert from "node:assert/strict";

import { deterministicCoachTask } from "../lib/coachIntent.ts";
import {
  classifyCoachRequest,
  storedCoachIntent,
  type CoachRoutingDecision,
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

function memberInput(overrides: Partial<MemberIntelligenceContextInput> = {}): MemberIntelligenceContextInput {
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
    ...overrides,
  };
}

const context = buildMemberIntelligenceContext(memberInput());

const regimenPrompt = "What medications and hormones do I currently have saved, including doses and timing?";
const regimenRoute = classifyCoachRequest(regimenPrompt);
assert.equal(regimenRoute.intent, "CURRENT_REGIMEN_LOOKUP");
assert.deepEqual(regimenRoute.requestedRegimenKinds, ["medication", "hormone"]);
const regimenAnswer = deterministicCoachTask(regimenRoute, context, regimenPrompt);
assert.ok(regimenAnswer);
assert.match(regimenAnswer.answer, /Zepbound.*10 mg\/0\.5 mL.*Sunday morning/s);
assert.match(regimenAnswer.answer, /Lisinopril.*10 mg.*morning/s);
assert.match(regimenAnswer.answer, /Testosterone cypionate.*80 mg.*twice weekly/s);
assert.doesNotMatch(regimenAnswer.answer, /Magnesium glycinate/);

const safetyPrompt = "Which items in my current routine need clinician or pharmacist review, and why?";
const safetyRoute = classifyCoachRequest(safetyPrompt);
assert.equal(safetyRoute.intent, "SAFETY_REVIEW", "Safety meaning must outrank inventory wording.");
const safetyAnswer = deterministicCoachTask(safetyRoute, context, safetyPrompt);
assert.ok(safetyAnswer);
assert.match(safetyAnswer.answer, /Omega-3/);
assert.match(safetyAnswer.answer, /bleeding risk/);

const priorityPrompt = "Based on my saved goals, recent check-ins, and active weekly practice, what is the highest-value action I should focus on this week?";
const priorityRoute = classifyCoachRequest(priorityPrompt);
assert.equal(priorityRoute.intent, "PRIORITIZATION");
const priorityAnswer = deterministicCoachTask(priorityRoute, context, priorityPrompt);
assert.ok(priorityAnswer);
assert.match(priorityAnswer.answer, /Keep a consistent wake time/);
assert.match(priorityAnswer.answer, /1 of 5 planned completions/);
assert.doesNotMatch(priorityAnswer.answer, /magnesium|glycine|melatonin/i);

const weeklyPracticePrompt = "Based on my current weekly practice, what is the smallest useful step I should take tomorrow?";
const weeklyPracticeRoute = classifyCoachRequest(weeklyPracticePrompt);
assert.equal(weeklyPracticeRoute.intent, "PROGRESS_COACHING", "Current weekly practice must not be mistaken for the current regimen.");
assert.deepEqual(weeklyPracticeRoute.requestedRegimenKinds, []);

const behaviorPrompt = "I slept poorly last night. How should I adjust tomorrow without changing my medications or supplements?";
const behaviorRoute = classifyCoachRequest(behaviorPrompt);
assert.equal(behaviorRoute.intent, "BEHAVIORAL_COACHING");
assert.equal(behaviorRoute.constraints.preserveMedicationPlan, true);
assert.equal(behaviorRoute.constraints.preserveSupplementPlan, true);
const behaviorAnswer = deterministicCoachTask(behaviorRoute, context, behaviorPrompt);
assert.ok(behaviorAnswer);
assert.match(behaviorAnswer.answer, /medications and supplements unchanged/i);
assert.doesNotMatch(behaviorAnswer.answer, /(?:start|stop|add|increase|decrease|switch).{0,30}(?:medication|supplement)/i);

const missingPrompt = "What important information is missing from my profile that would make your recommendations better?";
const missingRoute = classifyCoachRequest(missingPrompt);
assert.equal(missingRoute.intent, "MISSING_CONTEXT");
const missingAnswer = deterministicCoachTask(missingRoute, context, missingPrompt);
assert.ok(missingAnswer);
assert.match(missingAnswer.answer, /missing dose for DHEA/i);
assert.doesNotMatch(missingAnswer.answer, /health profile.*missing/i, "Existing profile data must not be mislabeled as missing.");

const outsidePrompt = "What is the capital of France?";
const outsideRoute = classifyCoachRequest(outsidePrompt);
assert.equal(outsideRoute.intent, "OUT_OF_SCOPE");
assert.match(deterministicCoachTask(outsideRoute, context, outsidePrompt)?.answer ?? "", /focused on your saved health/i);

const typoRoute = classifyCoachRequest("Show my meds and hormons with dose and timing");
assert.equal(typoRoute.intent, "CURRENT_REGIMEN_LOOKUP", "Common shorthand and a minor typo must still route correctly.");
assert.deepEqual(typoRoute.requestedRegimenKinds, ["medication", "hormone"]);

const mixedRoute = classifyCoachRequest("List my routine items that need a pharmasist review because of safety interactions");
assert.equal(mixedRoute.intent, "SAFETY_REVIEW", "Mixed inventory and safety wording must preserve the safety job.");

assert.equal(storedCoachIntent(regimenRoute.intent), "CURRENT_PLAN_LOOKUP", "Detailed routing remains compatible with the deployed diagnostics constraint.");

const noSafetyContext = buildMemberIntelligenceContext(memberInput({ safetyFindings: [], safetyEvaluationComplete: true }));
const noSafetyAnswer = deterministicCoachTask(safetyRoute, noSafetyContext, safetyPrompt);
assert.match(noSafetyAnswer?.answer ?? "", /not identify an unresolved/i);
assert.match(noSafetyAnswer?.answer ?? "", /not a guarantee/i);

const routeShape: CoachRoutingDecision = classifyCoachRequest("What supplements am I currently taking?");
assert.equal(routeShape.intent, "SUPPLEMENT_LOOKUP");
assert.deepEqual(routeShape.requestedRegimenKinds, ["supplement", "endocrine_active_supplement"]);

console.log("PR109 intent-first coaching and deterministic retrieval scenarios passed.");
