import assert from "node:assert/strict";

import { classifyCoachRequest } from "../lib/contextualCoach.ts";

const failedPreviewQuestion = "Based on my current weekly practice, what is the smallest useful step I should take tomorrow?";
const weeklyPracticeRoute = classifyCoachRequest(failedPreviewQuestion);
assert.equal(weeklyPracticeRoute.intent, "PROGRESS_COACHING");
assert.deepEqual(weeklyPracticeRoute.requestedRegimenKinds, []);

assert.equal(
  classifyCoachRequest("What supplements am I currently taking?").intent,
  "SUPPLEMENT_LOOKUP",
);
assert.equal(
  classifyCoachRequest("Show my current medications.").intent,
  "MEDICATION_LOOKUP",
);
assert.equal(
  classifyCoachRequest("What is in my routine?").intent,
  "CURRENT_REGIMEN_LOOKUP",
);
assert.equal(
  classifyCoachRequest("Which items in my current routine need clinician review?").intent,
  "SAFETY_REVIEW",
);

console.log("PR118 weekly-practice routing assertions passed.");
