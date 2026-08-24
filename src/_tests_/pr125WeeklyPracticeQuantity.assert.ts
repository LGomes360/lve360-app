import assert from "node:assert/strict";

import {
  buildWeeklyPracticeMetrics,
  normalizePracticeQuantityFields,
  practiceCompletionSummary,
  type PracticeCompletionQuantity,
} from "../lib/practiceQuantity.ts";

function completions(count: number, quantity: number | null, unit: string | null): PracticeCompletionQuantity[] {
  return Array.from({ length: count }, (_, index) => ({
    completion_date: `2026-08-${String(17 + index).padStart(2, "0")}`,
    completion_kind: "full",
    completed_quantity: quantity,
    quantity_unit: unit,
  }));
}

function metrics(input: { practice: string; target: number | null; unit: string | null; planned: number; completed: number; completionQuantity: number | null }) {
  return buildWeeklyPracticeMetrics({
    practice: input.practice,
    targetQuantity: input.target,
    quantityUnit: input.unit,
    minimumQuantity: null,
    minimumQuantityUnit: null,
    plannedSessions: input.planned,
    completions: completions(input.completed, input.completionQuantity, input.unit),
  });
}

const sitUps = metrics({ practice: "Sit-ups", target: 10, unit: "sit-ups", planned: 5, completed: 5, completionQuantity: 10 });
assert.equal(sitUps.completed_sessions, 5);
assert.equal(sitUps.planned_sessions, 5);
assert.equal(sitUps.known_total_quantity, 50);
assert.equal(sitUps.total_quantity_unit, "sit-ups");

const wallSit = metrics({ practice: "Wall sit", target: 1, unit: "minute", planned: 5, completed: 4, completionQuantity: 1 });
assert.equal(wallSit.completed_sessions, 4);
assert.equal(wallSit.known_total_quantity, 4);

const walk = metrics({ practice: "Walk", target: 20, unit: "minutes", planned: 4, completed: 3, completionQuantity: 20 });
assert.equal(walk.completed_sessions, 3);
assert.equal(walk.planned_sessions, 4);

const meditation = metrics({ practice: "Meditate", target: null, unit: null, planned: 5, completed: 5, completionQuantity: null });
assert.equal(meditation.completed_sessions, 5);
assert.equal(meditation.known_total_quantity, null);

const historical = metrics({ practice: "Sit-ups", target: null, unit: null, planned: 5, completed: 5, completionQuantity: null });
assert.equal(historical.known_total_quantity, null, "Historical frequency must not be reinterpreted as physical repetitions.");

assert.equal(normalizePracticeQuantityFields({ target_quantity: -1, quantity_unit: "sit-ups" }).ok, false);
assert.equal(normalizePracticeQuantityFields({ target_quantity: 10, quantity_unit: null }).ok, false);
assert.equal(normalizePracticeQuantityFields({ target_quantity: "words", quantity_unit: "sit-ups" }).ok, false);
assert.deepEqual(normalizePracticeQuantityFields({ target_quantity: 10, quantity_unit: "sit-ups", minimum_quantity: 3 }), {
  ok: true,
  value: { target_quantity: 10, quantity_unit: "sit-ups", minimum_quantity: 3, minimum_quantity_unit: "sit-ups" },
});

assert.match(practiceCompletionSummary(sitUps), /5 of 5 planned times this week/);
assert.match(practiceCompletionSummary(sitUps), /totaling 50 sit-ups/);
assert.doesNotMatch(practiceCompletionSummary(sitUps), /completed 5 sit-ups/);
assert.match(practiceCompletionSummary(historical), /5 of 5 planned times this week/);
assert.doesNotMatch(practiceCompletionSummary(historical), /totaling/);

console.log("PR125 weekly practice quantity assertions passed.");
