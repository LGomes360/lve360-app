import assert from "node:assert/strict";

import { classifyCoachRequest } from "../lib/contextualCoach.ts";

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

console.log("PR119 next-week routing assertions passed.");
