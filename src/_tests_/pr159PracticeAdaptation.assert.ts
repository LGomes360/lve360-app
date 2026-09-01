import assert from "node:assert/strict";

import {
  PRACTICE_ADAPTATIONS,
  adaptationForReviewDecision,
  cleanAdaptationRationale,
  reviewDecisionForAdaptation,
  suggestedAdaptationPlan,
  validateAdaptationPlan,
} from "../lib/weeklyReview.ts";

const practice = {
  action_label: "Walk after lunch",
  cue: "After clearing my plate",
  frequency_per_week: 5,
  target_quantity: 10,
  quantity_unit: "minutes",
  minimum_quantity: 2,
  minimum_quantity_unit: "minutes",
  minimum_version: "Walk to the driveway",
};

assert.deepEqual(PRACTICE_ADAPTATIONS, [
  "continue",
  "decrease",
  "increase",
  "modify",
  "pause",
  "replace",
  "graduate",
]);

assert.equal(adaptationForReviewDecision("keep"), "continue");
assert.equal(adaptationForReviewDecision("shrink"), "decrease");
assert.equal(adaptationForReviewDecision("advance"), "increase");
assert.equal(adaptationForReviewDecision("swap"), "replace");
assert.equal(reviewDecisionForAdaptation("modify"), "keep");
assert.equal(reviewDecisionForAdaptation("graduate"), "pause");

assert.equal(cleanAdaptationRationale("  The cue worked well.  "), "The cue worked well.");
assert.equal(cleanAdaptationRationale("no"), null);

const continued = suggestedAdaptationPlan(practice, "continue");
assert.ok(continued);
assert.ok(validateAdaptationPlan(practice, "continue", continued));
assert.equal(validateAdaptationPlan(practice, "continue", { ...continued, cue: "After coffee" }), null);

assert.ok(validateAdaptationPlan(practice, "decrease", { ...continued, frequency_per_week: 4 }));
assert.equal(validateAdaptationPlan(practice, "decrease", { ...continued, frequency_per_week: 6 }), null);
assert.ok(validateAdaptationPlan(practice, "increase", { ...continued, target_quantity: 12 }));
assert.equal(validateAdaptationPlan(practice, "increase", { ...continued, target_quantity: 8 }), null);
assert.ok(validateAdaptationPlan(practice, "modify", { ...continued, cue: "After my first meeting" }));
assert.equal(validateAdaptationPlan(practice, "modify", continued), null);

const replacement = suggestedAdaptationPlan(practice, "replace");
assert.ok(replacement);
assert.equal(replacement.action_label, "");
assert.ok(validateAdaptationPlan(practice, "replace", { ...continued, action_label: "Prepare tomorrow's lunch" }));
assert.equal(validateAdaptationPlan(practice, "replace", continued), null);
assert.equal(validateAdaptationPlan(practice, "pause", null), null);
assert.equal(validateAdaptationPlan(practice, "graduate", null), null);

console.log("PR159 Practice adaptation assertions passed.");
