import assert from "node:assert/strict";
import fs from "node:fs";

import {
  BLUEPRINT_MIN_RECOMMENDATIONS,
  BLUEPRINT_TARGET_RECOMMENDATIONS,
  validateBlueprintRecommendationMix,
} from "../lib/blueprintRecommendationMix.ts";

assert.equal(BLUEPRINT_MIN_RECOMMENDATIONS, 5);
assert.equal(BLUEPRINT_TARGET_RECOMMENDATIONS, 10);

const workspaceSource = fs.readFileSync("src/lib/blueprintWorkspace.ts", "utf8");
assert.match(workspaceSource, /BLUEPRINT_ENGINE_VERSION/);
assert.match(workspaceSource, /blueprint_engine_version:\s*BLUEPRINT_ENGINE_VERSION/g);

assert.equal(validateBlueprintRecommendationMix([
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "New - consider",
  "Clinician review",
  "Clinician review",
]).valid, true, "A useful report must not fail merely because safe filler is unavailable.");

assert.equal(validateBlueprintRecommendationMix([
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "New - consider",
  "Clinician review",
]).valid, true, "The seven-item production mix must remain valid.");

assert.equal(validateBlueprintRecommendationMix([
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
  "Current - optimize",
]).valid, true, "A current-stack review must not be forced to recommend another purchase.");

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
]).valid, false, "Reports with fewer than five recommendations must still fail closed.");

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
