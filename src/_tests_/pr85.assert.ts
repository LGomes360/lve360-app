import assert from "node:assert/strict";

import {
  buildRecommendationDecisionSeed,
  extractBlueprintGoalNames,
  isActionableRecommendationStatus,
  isMemberRecommendationDecision,
  recommendationOverlapNames,
  recommendationPersonalReason,
} from "../lib/recommendationDecision.ts";

const goals = extractBlueprintGoalNames(`
| Goal | What Progress Looks Like |
| --- | --- |
| Increase Energy | Support steadier daytime energy. |
| Cognitive Performance | Support focus and memory. |
| Improve Sleep | Build a consistent routine. |
`);
assert.deepEqual(goals, ["Increase Energy", "Cognitive Performance", "Improve Sleep"]);

const current = [
  { name: "Metformin" },
  { name: "B-Complex" },
  { name: "Methyl Protect" },
  { name: "Omega-3" },
];
const proposal = {
  id: "item-b12",
  stack_id: "stack-1",
  name: "Vitamin B12",
  rationale: "Supports normal nervous-system function and energy metabolism.",
  notes: "Blueprint status: New - consider",
};

assert.deepEqual(recommendationOverlapNames(proposal.name, current), ["B-Complex", "Methyl Protect"]);
const reason = recommendationPersonalReason(proposal, current, goals);
assert.match(reason, /current record includes Metformin/);
assert.match(reason, /Increase Energy/);
assert.match(reason, /not a finding that you are deficient/);

const seed = buildRecommendationDecisionSeed(proposal, current, goals);
assert.deepEqual(seed.overlap_snapshot, ["B-Complex", "Methyl Protect"]);
assert.match(seed.context_fingerprint, /^pr85:[a-f0-9]{8}$/);
assert.equal(buildRecommendationDecisionSeed(proposal, [...current].reverse(), goals).context_fingerprint, seed.context_fingerprint);
assert.notEqual(
  buildRecommendationDecisionSeed(proposal, current.filter((item) => item.name !== "Metformin"), goals).context_fingerprint,
  seed.context_fingerprint,
  "A meaningful regimen change must create a new decision context.",
);

assert.equal(isActionableRecommendationStatus("review"), true);
assert.equal(isActionableRecommendationStatus("clinician_review"), true);
assert.equal(isActionableRecommendationStatus("deferred"), false);
assert.equal(isActionableRecommendationStatus("dismissed"), false);
assert.equal(isActionableRecommendationStatus("adopted"), false);
assert.equal(isMemberRecommendationDecision("dismissed"), true);
assert.equal(isMemberRecommendationDecision("adopted"), false);

console.log("PR85 recommendation decision assertions passed.");
