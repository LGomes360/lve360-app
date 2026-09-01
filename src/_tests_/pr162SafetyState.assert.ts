import assert from "node:assert/strict";

import { deriveCanonicalSafetyState, isSafetyRelevantRegimenChange } from "../lib/safetyState.ts";

const STACK_ID = "22222222-2222-4222-8222-222222222222";
const CREATED_AT = "2026-08-20T12:00:00.000Z";

const clear = deriveCanonicalSafetyState({
  stackId: STACK_ID,
  stackCreatedAt: CREATED_AT,
  reportStatus: "safe",
});
assert.equal(clear.status, "clear");
assert.equal(clear.needsAttention, false);
assert.match(clear.href, /#safety-notes$/);

const needsReview = deriveCanonicalSafetyState({
  stackId: STACK_ID,
  stackCreatedAt: CREATED_AT,
  reportStatus: "warning",
});
assert.equal(needsReview.status, "review_required");
assert.equal(needsReview.needsAttention, true);

const reviewed = deriveCanonicalSafetyState({
  stackId: STACK_ID,
  stackCreatedAt: CREATED_AT,
  reportStatus: "warning",
  acknowledgedAt: "2026-08-20T13:00:00.000Z",
});
assert.equal(reviewed.status, "reviewed");
assert.equal(reviewed.acknowledgementRecorded, true);
assert.equal(reviewed.acknowledgementEffective, true);

const changedAfterReview = deriveCanonicalSafetyState({
  stackId: STACK_ID,
  stackCreatedAt: CREATED_AT,
  reportStatus: "warning",
  acknowledgedAt: "2026-08-20T13:00:00.000Z",
  latestRegimenChange: {
    createdAt: "2026-08-21T08:00:00.000Z",
    summary: "Updated a medication dose",
  },
});
assert.equal(changedAfterReview.status, "refresh_required");
assert.equal(changedAfterReview.acknowledgementRecorded, true, "The historical acknowledgement remains durable.");
assert.equal(changedAfterReview.acknowledgementEffective, false, "A later regimen change makes the old acknowledgement ineffective.");
assert.equal(changedAfterReview.planChangeSummary, "Updated a medication dose");

const changedBeforeReview = deriveCanonicalSafetyState({
  stackId: STACK_ID,
  stackCreatedAt: CREATED_AT,
  reportStatus: "safe",
  latestRegimenChange: { createdAt: "2026-08-19T08:00:00.000Z" },
});
assert.equal(changedBeforeReview.status, "clear", "Earlier Plan history must not invalidate a later Blueprint.");

const unavailable = deriveCanonicalSafetyState({
  stackId: STACK_ID,
  stackCreatedAt: CREATED_AT,
  reportStatus: "error",
  acknowledgedAt: "2026-08-20T13:00:00.000Z",
});
assert.equal(unavailable.status, "unavailable");
assert.equal(unavailable.needsAttention, true);
assert.equal(unavailable.acknowledgementEffective, false, "An acknowledgement cannot clear an unreadable safety section.");

const missing = deriveCanonicalSafetyState({ stackId: null, stackCreatedAt: null, reportStatus: null });
assert.equal(missing.status, "unavailable");
assert.equal(missing.href, "/blueprints");

assert.equal(isSafetyRelevantRegimenChange({
  changeType: "updated",
  beforeState: { name: "Magnesium", dose: "200 mg", reorder_url: "https://old.example" },
  afterState: { name: "Magnesium", dose: "200 mg", reorder_url: "https://new.example" },
}), false, "A shopping-link edit must not manufacture a new safety alert.");
assert.equal(isSafetyRelevantRegimenChange({
  changeType: "updated",
  beforeState: { name: "Zepbound", dose: "7.5 mg", active: true },
  afterState: { name: "Zepbound", dose: "10 mg", active: true },
}), true, "A dose edit must require current safety review.");
assert.equal(isSafetyRelevantRegimenChange({
  changeType: "stopped",
  beforeState: { name: "Vitamin D", active: true },
  afterState: { name: "Vitamin D", active: false },
}), true);

console.log("PR162 canonical safety state assertions passed.");
