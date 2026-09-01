import assert from "node:assert/strict";

import type { CurrentBlueprintContext, ExperimentBlueprintContext } from "../lib/blueprintContext.ts";
import type { CurrentRegimenItem, CurrentRegimenKind } from "../lib/currentRegimenModel.ts";
import { deriveCanonicalSafetyState } from "../lib/safetyState.ts";
import {
  buildMemberIntelligenceContext,
  MEMBER_CONTEXT_VERSION,
  type MemberContextExperimentInput,
  type MemberIntelligenceContextInput,
} from "../lib/memberContext.ts";

const NOW = "2026-08-14T12:00:00.000Z";

function regimenItem(index: number, kind: CurrentRegimenKind, overrides: Partial<CurrentRegimenItem> = {}): CurrentRegimenItem {
  const name = overrides.name ?? `${kind} ${index}`;
  return {
    id: overrides.id ?? `regimen-${index}`,
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

function blueprint(overrides: Partial<CurrentBlueprintContext> = {}): CurrentBlueprintContext {
  return {
    stack_id: "stack-1",
    created_at: "2026-08-10T12:00:00.000Z",
    goals: ["Improve sleep"],
    safety_status: "safe",
    safety_acknowledged: false,
    needs_refresh: false,
    safety: deriveCanonicalSafetyState({
      stackId: "stack-1",
      stackCreatedAt: "2026-08-10T12:00:00.000Z",
      reportStatus: "safe",
    }),
    priorities: [{ id: "priority-1", label: "Keep a consistent wake time", category: "sleep", kind: "lifestyle" }],
    ...overrides,
  };
}

function experiment(overrides: Partial<MemberContextExperimentInput> = {}): MemberContextExperimentInput {
  return {
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
    updated_at: "2026-08-13T12:00:00.000Z",
    ...overrides,
  };
}

function blueprintLink(overrides: Partial<ExperimentBlueprintContext> = {}): ExperimentBlueprintContext {
  return {
    source_stack_id: "stack-1",
    source_action_id: "priority-1",
    priority_label: "Keep a consistent wake time",
    priority_category: "sleep",
    priority_kind: "lifestyle",
    blueprint_created_at: "2026-08-10T12:00:00.000Z",
    is_current_blueprint: true,
    needs_review: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<MemberIntelligenceContextInput> = {}): MemberIntelligenceContextInput {
  const active = experiment();
  return {
    generatedAt: NOW,
    member: { id: "member-1", tier: "premium", joinedAt: "2026-07-01T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z" },
    healthProfile: {
      submissionId: "submission-1",
      updatedAt: "2026-08-01T12:00:00.000Z",
      age: 52,
      sex: "male",
      conditions: [],
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
      updatedAt: "2026-08-13T12:00:00.000Z",
    },
    savedGoals: [{
      label: "Improve sleep",
      kind: "named",
      targetValue: null,
      provenance: { source: "goals", recordId: "goal-1", updatedAt: "2026-08-12T12:00:00.000Z" },
    }],
    goalsUpdatedAt: "2026-08-12T12:00:00.000Z",
    blueprint: blueprint(),
    regimen: [
      regimenItem(1, "medication", { name: "Medication A", dose: "10 mg", timing: "morning" }),
      regimenItem(2, "hormone", { name: "Hormone A", dose: "1 mg", timing: "weekly" }),
      regimenItem(3, "supplement", { name: "Supplement A", dose: "100 mg", timing: "evening" }),
      regimenItem(4, "endocrine_active_supplement", { name: "Endocrine supplement A" }),
    ],
    experiments: [active],
    reviews: [],
    completions: [{ id: "completion-1", experiment_id: active.id, completion_date: "2026-08-12", completion_kind: "full", updated_at: "2026-08-12T12:00:00.000Z" }],
    practiceBlueprintContexts: { [active.id]: blueprintLink() },
    checkIns: [{ id: "log-1", log_date: "2026-08-13", weight: 200, sleep: 4, energy: 7, updated_at: "2026-08-13T12:00:00.000Z" }],
    safetyFindings: [],
    safetyEvaluationComplete: true,
    ...overrides,
  };
}

// 1. Simple member with four distinct regimen records.
const simple = buildMemberIntelligenceContext(baseInput());
assert.equal(simple.version, MEMBER_CONTEXT_VERSION);
assert.equal(simple.regimen.medications.value.length, 1);
assert.equal(simple.regimen.hormones.value.length, 1);
assert.equal(simple.regimen.supplements.value.length, 1);
assert.equal(simple.regimen.endocrineActiveSupplements.value.length, 1);
assert.equal(simple.regimen.endocrineActiveSupplements.value[0].dose, null, "Missing dose must remain explicitly null.");
assert.equal(simple.regimen.medications.value[0].provenance.source, "current_regimen_items");
assert.equal(simple.unresolvedSafetyItems.status, "present", "A completed evaluation with no findings is known-clear, not missing.");

// 2. Moderate member retains all records and source distinctions.
const moderateRegimen = [
  ...Array.from({ length: 3 }, (_, index) => regimenItem(index, "medication")),
  ...Array.from({ length: 5 }, (_, index) => regimenItem(index + 10, "supplement")),
];
const moderate = buildMemberIntelligenceContext(baseInput({ regimen: moderateRegimen }));
assert.equal(moderate.regimen.medications.value.length, 3);
assert.equal(moderate.regimen.supplements.value.length, 5);

// 3. Complex member keeps 20+ regimen records without a hidden slice.
const complexRegimen = [
  ...Array.from({ length: 5 }, (_, index) => regimenItem(index, "medication")),
  regimenItem(20, "hormone"),
  ...Array.from({ length: 18 }, (_, index) => regimenItem(index + 30, "supplement")),
];
const complex = buildMemberIntelligenceContext(baseInput({ regimen: complexRegimen }));
assert.equal(
  complex.regimen.medications.value.length + complex.regimen.hormones.value.length + complex.regimen.supplements.value.length,
  24,
  "Canonical context must not truncate a complex regimen.",
);

// 4. No-supplement state is explicit rather than fabricated.
const noSupplements = buildMemberIntelligenceContext(baseInput({ regimen: [regimenItem(1, "medication")] }));
assert.equal(noSupplements.regimen.supplements.status, "missing");
assert.match(noSupplements.regimen.supplements.missingReason ?? "", /No active supplements/);
assert.equal(noSupplements.regimen.medications.status, "present");

// 5. No-medication state remains distinguishable from no regimen.
const noMedications = buildMemberIntelligenceContext(baseInput({ regimen: [regimenItem(1, "supplement")] }));
assert.equal(noMedications.regimen.medications.status, "missing");
assert.equal(noMedications.regimen.supplements.status, "present");

// 6. A stale Blueprint is represented in the section and aggregate freshness.
const stale = buildMemberIntelligenceContext(baseInput({ blueprint: blueprint({ needs_refresh: true }) }));
assert.equal(stale.blueprint.status, "stale");
assert.ok(stale.contextFreshness.staleSections.includes("blueprint"));

// 7. Conflicting and missing goal sources are observable rather than flattened.
const differentGoals = buildMemberIntelligenceContext(baseInput({
  blueprint: blueprint({ goals: ["Build strength"] }),
}));
assert.equal(differentGoals.goals.alignment.status, "different");
const missingGoals = buildMemberIntelligenceContext(baseInput({
  savedGoals: [],
  goalsUpdatedAt: null,
  blueprint: blueprint({ goals: [] }),
}));
assert.equal(missingGoals.goals.alignment.status, "missing");
assert.equal(missingGoals.goals.saved.status, "missing");

// 8. Active-practice linkage, completion evidence, and no-active state are explicit.
assert.equal(simple.activePractice.status, "present");
assert.equal(simple.activePractice.value?.blueprintLink.status, "current");
assert.equal(simple.activePractice.value?.goalLink.status, "not_recorded");
assert.equal(simple.activePractice.value?.completionCount, 1);
const noActivePractice = buildMemberIntelligenceContext(baseInput({
  experiments: [experiment({ status: "completed" })],
}));
assert.equal(noActivePractice.activePractice.status, "missing");
assert.equal(noActivePractice.recentPracticeHistory.status, "present");

console.log("PR108 canonical member context acceptance scenarios passed.");
