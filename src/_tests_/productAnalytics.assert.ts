import assert from "node:assert/strict";

import { validateProductEvent } from "../lib/productAnalyticsTypes.ts";

assert.deepEqual(validateProductEvent({
  event_name: "checkout_started",
  source: "upgrade",
  plan: "annual",
}), {
  event_name: "checkout_started",
  source: "upgrade",
  plan: "annual",
  step: null,
  experiment_id: null,
});

assert.deepEqual(validateProductEvent({
  event_name: "activation_completed",
  source: "onboarding",
  step: 6,
  experiment_id: "00000000-0000-4000-8000-000000000008",
}), {
  event_name: "activation_completed",
  source: "onboarding",
  plan: null,
  step: 6,
  experiment_id: "00000000-0000-4000-8000-000000000008",
});

assert.equal(validateProductEvent({ event_name: "medication_added", source: "today" }), null);
assert.equal(validateProductEvent({ event_name: "practice_completed", source: "unknown" }), null);
assert.equal(validateProductEvent({ event_name: "checkout_started", source: "upgrade", plan: "lifetime" }), null);
assert.equal(validateProductEvent({ event_name: "activation_completed", source: "onboarding", step: 7 }), null);
assert.equal(validateProductEvent({ event_name: "weekly_review_completed", source: "weekly_review", experiment_id: "not-a-uuid" }), null);

console.log("product analytics assertions passed");
