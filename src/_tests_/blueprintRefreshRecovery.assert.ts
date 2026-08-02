import assert from "node:assert/strict";

import {
  BLUEPRINT_MIN_RECOMMENDATIONS,
  BLUEPRINT_TARGET_RECOMMENDATIONS,
  validateBlueprintRecommendationMix,
} from "../lib/blueprintRecommendationMix.ts";

assert.equal(BLUEPRINT_MIN_RECOMMENDATIONS, 8);
assert.equal(BLUEPRINT_TARGET_RECOMMENDATIONS, 10);

assert.equal(validateBlueprintRecommendationMix([
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "New - consider",
  "Clinician review",
  "Clinician review",
]).valid, true, "A useful eight-item report must not fail merely because safe filler is unavailable.");

assert.equal(validateBlueprintRecommendationMix([
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "New - consider",
  "New - consider",
]).valid, false, "The five-current-item cap must remain enforced.");

assert.equal(validateBlueprintRecommendationMix([
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "New - consider",
  "New - consider",
]).valid, false, "Reports with fewer than eight recommendations must still fail closed.");

assert.equal(validateBlueprintRecommendationMix([
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "New - consider",
  "New - consider",
  "New - consider",
  "New - consider",
  "New - consider",
  "New - consider",
]).valid, false, "Reports with more than ten recommendations must still be rejected.");

console.log("Blueprint refresh recovery assertions passed.");
