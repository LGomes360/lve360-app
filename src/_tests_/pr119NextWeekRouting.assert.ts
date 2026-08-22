import assert from "node:assert/strict";

import { buildSafeNextWeekMovementFallback, classifyCoachRequest } from "../lib/contextualCoach.ts";

const exactFailedQuestion = "Suggest one small next-week movement practice after lunch. Keep my medications, hormones, supplements, and current Routine unchanged.";
const route = classifyCoachRequest(exactFailedQuestion);

assert.equal(route.intent, "PROGRESS_COACHING", "The exact failed Preview question must route to weekly progress coaching.");
assert.deepEqual(route.requestedRegimenKinds, []);
assert.equal(route.constraints.preserveMedicationPlan, true);
assert.equal(route.constraints.preserveHormonePlan, true);
assert.equal(route.constraints.preserveSupplementPlan, true);

for (const question of [
  "What should I practice next week?",
  "What should I practice next-week?",
]) {
  assert.equal(classifyCoachRequest(question).intent, "PROGRESS_COACHING", `Equivalent weekly-practice wording must route consistently: ${question}`);
}

assert.deepEqual(buildSafeNextWeekMovementFallback(exactFailedQuestion), {
  type: "weekly_practice",
  identityDirection: "movement",
  actionLabel: "Take a 10-minute walk after lunch",
  cue: "After lunch",
  frequencyPerWeek: 5,
  minimumVersion: "Walk for two minutes",
  rationale: "This connects a small movement practice to a reliable meal cue.",
});
assert.equal(
  buildSafeNextWeekMovementFallback("Should I change my supplements next week?"),
  null,
  "the deterministic fallback must remain limited to explicit lifestyle movement-practice requests",
);

console.log("PR119 next-week routing assertions passed.");
