import assert from "node:assert/strict";

import { buildBlueprintDelta, extractBlueprintRecommendationSnapshots } from "../lib/blueprintDelta.ts";

function report({ recommendations, dosing, safety }: { recommendations: string; dosing: string; safety: string }) {
  return [
    "## Contraindications & Med Interactions",
    "",
    safety,
    "",
    "## Your Blueprint Recommendations",
    "",
    "| Rank | Supplement | Status | Why It Matters |",
    "| --- | --- | --- | --- |",
    recommendations,
    "",
    "## Dosing & Notes",
    "",
    dosing,
  ].join("\n");
}

const previousMarkdown = report({
  safety: "- No material flags identified from the information provided.",
  recommendations: [
    "| 1 | Vitamin B12 | New - consider | Supports normal energy metabolism. |",
    "| 2 | Magnesium Glycinate | New - consider | Supports a consistent evening routine. |",
    "| 3 | CoQ10 | Clinician review | Review alongside the current medication list. |",
  ].join("\n"),
  dosing: [
    "- Vitamin B12: 500 mcg daily. Morning.",
    "- Magnesium Glycinate: 200 mg daily. Evening.",
  ].join("\n"),
});

const currentMarkdown = report({
  safety: "- Clinician review: Review the current medication and supplement combination before making a change.",
  recommendations: [
    "| 1 | Methylcobalamin | New - consider | Supports normal energy metabolism. |",
    "| 2 | Magnesium Bisglycinate | New - consider | Supports a consistent evening routine. |",
    "| 3 | Omega-3 | Clinician review | Discuss alongside the current medication list. |",
  ].join("\n"),
  dosing: [
    "- Methylcobalamin: 1,000 mcg daily. Morning.",
    "- Magnesium Bisglycinate: 200 mg daily. Evening.",
  ].join("\n"),
});

const snapshots = extractBlueprintRecommendationSnapshots(currentMarkdown);
assert.equal(snapshots.length, 3, "Only explicit recommendation-table entries should be compared.");
assert.equal(snapshots.filter((item) => item.key === "vitamin-b12").length, 1);
assert.equal(snapshots.filter((item) => item.key === "magnesium-glycinate").length, 1);

const currentOptimizeMarkdown = [
  "## Current Stack",
  "",
  "| Supplement | Purpose | Dose | Timing |",
  "| --- | --- | --- | --- |",
  "| Omega-3 | Cardiovascular wellness | 1000 mg | Evening |",
  "",
  "## Your Blueprint Recommendations",
  "",
  "| Rank | Supplement | Status | Why It Matters |",
  "| --- | --- | --- | --- |",
  "| 1 | Omega-3 | Current - optimize | Supports cardiovascular wellness. |",
].join("\n");
assert.equal(
  extractBlueprintRecommendationSnapshots(currentOptimizeMarkdown).find((item) => item.key === "omega-3")?.status,
  "Current - optimize",
  "Current, optimize rows are still explicit Blueprint recommendations and must be compared.",
);

const currentOptimizeDelta = buildBlueprintDelta({
  previousStackId: "stack-before-current-item",
  previousCreatedAt: "2026-08-01T12:00:00.000Z",
  currentCreatedAt: "2026-08-11T12:00:00.000Z",
  generationReason: "member-refresh",
  previousMarkdown: "## Your Blueprint Recommendations\n\nNo recommendations recorded.",
  currentMarkdown: currentOptimizeMarkdown,
});
const currentOmega = currentOptimizeDelta.recommendations.find((item) => item.key === "omega-3");
assert.equal(currentOmega?.attention, "informational");
assert.equal(currentOmega?.actionHref, "/routine");
assert.equal(currentOmega?.actionLabel, "Open in Routine");

const delta = buildBlueprintDelta({
  previousStackId: "stack-previous",
  previousCreatedAt: "2026-08-01T12:00:00.000Z",
  currentCreatedAt: "2026-08-11T12:00:00.000Z",
  generationReason: "member-refresh",
  previousMarkdown,
  currentMarkdown,
});

assert.deepEqual(delta.counts, { added: 1, changed: 1, removed: 1, unchanged: 1 });

const b12 = delta.recommendations.find((item) => item.key === "vitamin-b12");
assert.equal(b12?.kind, "changed", "A canonical B12 alias must not be falsely described as new.");
assert.ok(b12?.changedFields.includes("dose"));

const magnesium = delta.recommendations.find((item) => item.key === "magnesium-glycinate");
assert.equal(magnesium?.kind, "unchanged", "A canonical magnesium alias with the same guidance must remain stable.");

const omega = delta.recommendations.find((item) => item.key === "omega-3");
assert.equal(omega?.kind, "added");
assert.equal(omega?.attention, "clinician_review");
assert.equal(omega?.actionHref, "#recommendation-report");

const removed = delta.recommendations.find((item) => item.key === "coq10");
assert.equal(removed?.kind, "removed");
assert.equal(removed?.attention, "informational");
assert.match(removed?.explanation ?? "", /not an instruction to stop/i);

assert.equal(delta.safety.previousStatus, "safe");
assert.equal(delta.safety.currentStatus, "warning");
assert.equal(delta.safety.changed, true);
assert.equal(delta.safety.needsReview, true);

console.log("PR103 Blueprint Delta behavior assertions passed.");
