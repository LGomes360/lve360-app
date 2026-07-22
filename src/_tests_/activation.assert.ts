import assert from "node:assert/strict";

import {
  cleanText,
  isReadyToActivate,
  isSafeLifestyleAction,
  nextOnboardingStep,
} from "../lib/activation";

assert.equal(cleanText("  walk   after lunch ", 40), "walk after lunch");
assert.equal(isSafeLifestyleAction("Take a 10-minute walk after lunch"), true);
assert.equal(isSafeLifestyleAction("Take 200 mg magnesium nightly"), false);
assert.equal(isSafeLifestyleAction("Ask my clinician about medication timing"), false);
assert.equal(nextOnboardingStep({ onboarding_step: 2, status: "draft" }), 3);
assert.equal(nextOnboardingStep({ onboarding_step: 5, status: "active" }), 6);
assert.equal(isReadyToActivate({
  identity_direction: "movement",
  action_label: "Take a 10-minute walk after lunch",
  cue: "After I put away my lunch",
  frequency_per_week: 5,
  minimum_version: "Walk for two minutes",
  reminder_preference: "none",
}), true);
assert.equal(isReadyToActivate({
  identity_direction: "movement",
  action_label: "Take magnesium each night",
  cue: "After dinner",
  frequency_per_week: 5,
  minimum_version: "Take one capsule",
  reminder_preference: "none",
}), false);

console.log("activation assertions passed");
