import assert from "node:assert/strict";

import type { CurrentBlueprintContext, ExperimentBlueprintContext } from "../lib/blueprintContext.ts";
import { deterministicTodayBrief, shouldGenerateTodayBrief, type TodayBriefContext } from "../lib/todayBrief.ts";
import { deriveTodayBlueprintNotice, isUrgentBlueprintSafety } from "../lib/todaySurface.ts";
import { deriveCanonicalSafetyState } from "../lib/safetyState.ts";

const blueprint = (overrides: Partial<CurrentBlueprintContext> = {}): CurrentBlueprintContext => {
  const base = {
    stack_id: "22222222-2222-4222-8222-222222222222",
    created_at: "2026-08-15T12:00:00.000Z",
    safety_status: "safe" as const,
    safety_acknowledged: false,
    needs_refresh: false,
    priorities: [],
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    safety: overrides.safety ?? deriveCanonicalSafetyState({
      stackId: merged.stack_id,
      stackCreatedAt: merged.created_at,
      reportStatus: merged.safety_status,
      acknowledgedAt: merged.safety_acknowledged ? merged.created_at : null,
    }),
  };
};

const experimentBlueprint = (overrides: Partial<ExperimentBlueprintContext> = {}): ExperimentBlueprintContext => ({
  source_stack_id: blueprint().stack_id,
  source_action_id: "walk-after-lunch",
  priority_label: "Take a short walk after lunch",
  priority_category: "lifestyle",
  priority_kind: "lifestyle",
  blueprint_created_at: "2026-08-10T12:00:00.000Z",
  is_current_blueprint: true,
  needs_review: false,
  ...overrides,
});

assert.equal(deriveTodayBlueprintNotice(blueprint(), experimentBlueprint()), null, "A current, reviewed state must not render a zero-value notice.");

const staleNotice = deriveTodayBlueprintNotice(blueprint({ needs_refresh: true }), experimentBlueprint());
assert.equal(staleNotice?.tone, "maintenance");
assert.match(staleNotice?.detail ?? "", /focused lifestyle action is unchanged/i);

const combinedNotice = deriveTodayBlueprintNotice(
  blueprint({
    needs_refresh: true,
    safety_status: "warning",
    safety: deriveCanonicalSafetyState({
      stackId: "22222222-2222-4222-8222-222222222222",
      stackCreatedAt: "2026-08-15T12:00:00.000Z",
      reportStatus: "warning",
    }),
  }),
  experimentBlueprint({ needs_review: true }),
);
assert.equal(combinedNotice?.tone, "maintenance", "Ordinary stale and warning states must collapse into one maintenance notice.");
assert.match(combinedNotice?.detail ?? "", /earlier Blueprint/i);

const unavailableSafety = blueprint({ safety_status: "error" });
assert.equal(isUrgentBlueprintSafety(unavailableSafety), true, "Only an unacknowledged unavailable safety section interrupts the brief.");
assert.equal(deriveTodayBlueprintNotice(unavailableSafety, experimentBlueprint())?.tone, "urgent");
assert.equal(isUrgentBlueprintSafety(blueprint({ safety_status: "warning" })), false, "A reviewable warning is maintenance, not an urgent interruption.");
assert.equal(isUrgentBlueprintSafety(blueprint({ safety_status: "error", safety_acknowledged: true })), true, "An unavailable safety section cannot be cleared by acknowledgement.");

const briefContext = (blueprintContext: TodayBriefContext["blueprint"]): TodayBriefContext => ({
  localDate: "2026-08-15",
  experiment: {
    id: "11111111-1111-4111-8111-111111111111",
    identity: "Someone who moves consistently",
    actionLabel: "Walk for ten minutes after lunch",
    cue: "finish lunch",
    minimumVersion: "Walk for two minutes",
    target: 4,
    completed: 2,
    completedToday: false,
  },
  blueprint: blueprintContext,
  checkIn: null,
  reviewDue: false,
});

const staleBrief = briefContext({
  stackId: blueprint().stack_id,
  needsRefresh: true,
  safetyNeedsAttention: false,
  urgentSafetyInterruption: false,
});
assert.equal(shouldGenerateTodayBrief(staleBrief), true, "Normal Blueprint maintenance must not suppress the daily lifestyle brief.");
assert.equal(deterministicTodayBrief(staleBrief).primaryAction, "mark_complete");

const urgentBrief = briefContext({
  ...staleBrief.blueprint!,
  urgentSafetyInterruption: true,
});
assert.equal(shouldGenerateTodayBrief(urgentBrief), false);
assert.equal(deterministicTodayBrief(urgentBrief).primaryAction, "open_blueprint");

console.log("PR112 Today notice and action-priority scenarios passed.");
