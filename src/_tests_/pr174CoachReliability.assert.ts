import assert from "node:assert/strict";

import { deterministicCoachTask } from "../lib/coachIntent.ts";
import { validateCoachTaskSuccess } from "../lib/coachTaskValidation.ts";
import { classifyCoachRequest, coachSuggestedPrompts } from "../lib/contextualCoach.ts";
import { buildMemberIntelligenceContext, type MemberIntelligenceContext } from "../lib/memberContext.ts";

const NOW = "2026-09-13T12:00:00.000Z";

function memberContext(withChanges = true): MemberIntelligenceContext {
  return buildMemberIntelligenceContext({
    generatedAt: NOW,
    member: { id: "member-1", tier: "premium", joinedAt: "2026-01-01T00:00:00.000Z", updatedAt: NOW },
    healthProfile: null,
    preferences: null,
    savedGoals: [{
      key: "energy",
      label: "Improve daily energy",
      kind: "named",
      targetValue: null,
      provenance: { source: "goals", recordId: "goal-1", updatedAt: NOW },
    }],
    goalsUpdatedAt: NOW,
    blueprint: null,
    regimen: [],
    practices: [{ id: "practice-1", status: "active", updated_at: NOW }],
    experiments: [{
      id: "experiment-1",
      practice_id: "practice-1",
      source_stack_id: null,
      source_action_id: null,
      connection_type: "goal",
      goal_id: "goal-1",
      goal_key: "energy",
      goal_label_snapshot: "Improve daily energy",
      identity_direction: "movement",
      action_label: "Walk for 10 minutes after lunch",
      cue: "After lunch",
      frequency_per_week: 5,
      target_quantity: 10,
      quantity_unit: "minutes",
      minimum_quantity: 2,
      minimum_quantity_unit: "minutes",
      minimum_version: "Walk for two minutes",
      status: "active",
      week_start: "2026-09-07",
      created_at: NOW,
      updated_at: NOW,
    }],
    reviews: [],
    completions: [],
    practiceBlueprintContexts: {},
    checkIns: [],
    planChanges: withChanges ? [{
      id: "change-1",
      domain: "practice",
      entity_type: "practice",
      entity_id: "practice-1",
      change_type: "created",
      source: "member",
      change_summary: "Started Walk for 10 minutes after lunch",
      created_at: "2026-09-12T18:00:00.000Z",
    }] : [],
    safetyFindings: [],
    safetyEvaluationComplete: true,
  });
}

function verify(question: string, context = memberContext()) {
  const route = classifyCoachRequest(question);
  assert.equal(route.intent, "CURRENT_PLAN_LOOKUP", `Expected a Plan lookup for: ${question}`);
  const result = deterministicCoachTask(route, context, question);
  assert(result, "Current Plan queries must use the deterministic read-only path.");
  assert.deepEqual(result.sourceIds, question.includes("changed")
    ? ["plan_change_history", "current_plan"]
    : ["current_plan", "plan_change_history"]);
  const report = validateCoachTaskSuccess({
    route,
    question,
    answerText: result.answer,
    memberContext: context,
    usedSourceIds: result.sourceIds,
    safetyChecked: true,
  });
  assert.equal(report.passed, true, JSON.stringify(report, null, 2));
  assert.equal(report.score, 100);
  assert.equal(report.factualCoverage, 1);
  assert.match(result.answer, /nothing was changed|read-only/i);
  assert.match(result.answer, /next step/i);
  return result.answer;
}

const summary = verify("What is my current plan?");
assert.match(summary, /Walk for 10 minutes after lunch/);
assert.match(summary, /Improve daily energy/);
assert.match(summary, /0 medications, 0 hormones, and 0 supplements/);
assert.match(summary, /Started Walk for 10 minutes after lunch/);
assert.match(summary, /unrecorded changes are not included/i);

const history = verify("What changed in my plan recently?");
assert.match(history, /2026-09-12/);
assert.match(history, /Generated coaching and suggestions do not appear here unless you reviewed and confirmed a change/i);

const emptyHistory = verify("What changed in my plan recently?", memberContext(false));
assert.match(emptyHistory, /No confirmed changes have been recorded since change tracking began/i);

const mutationRequest = classifyCoachRequest("Show my current plan, then change my medication dose.");
assert.equal(mutationRequest.intent, "REQUEST_TO_CHANGE_RECORD", "A mutation request must not enter the read-only Plan lookup path.");

assert.equal(coachSuggestedPrompts("today")[0], "What is my current Plan?", "The reliable Plan lookup should be discoverable from Today.");

console.log("PR174 Coach Reliability Gate scenarios passed.");
