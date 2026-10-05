import assert from "node:assert/strict";
import { summarizeFounderAiCosts } from "../lib/founderAiCosts.ts";

const mixed = summarizeFounderAiCosts([
  { task: "alpha", estimated_cost_usd: "0.12" },
  { task: "alpha", estimated_cost_usd: null },
  { task: "beta", estimated_cost_usd: 0.03 },
]);
assert.ok(Math.abs(mixed.estimatedCostUsd! - 0.15) < 1e-12);
assert.equal(mixed.unknownCostGenerations, 1);
assert.deepEqual(mixed.topTasks[0], { task: "alpha", generations: 2, estimatedCostUsd: 0.12, unknownCostGenerations: 1 });

const unavailable = summarizeFounderAiCosts([{ task: "failed", estimated_cost_usd: null }]);
assert.equal(unavailable.estimatedCostUsd, null, "all unknown costs must not look free");
assert.equal(unavailable.topTasks[0].estimatedCostUsd, null);
assert.equal(unavailable.unknownCostGenerations, 1);

const zero = summarizeFounderAiCosts([
  { task: "zero", estimated_cost_usd: 0 },
  { task: "zero", estimated_cost_usd: "0" },
]);
assert.equal(zero.estimatedCostUsd, 0, "an explicitly reported zero remains a known cost");
assert.equal(zero.unknownCostGenerations, 0);

assert.deepEqual(summarizeFounderAiCosts([]), { estimatedCostUsd: 0, unknownCostGenerations: 0, topTasks: [] });

const invalid = summarizeFounderAiCosts(["", "  ", "not-a-cost", NaN, Infinity, -1].map((cost) => ({ task: "invalid", estimated_cost_usd: cost })));
assert.equal(invalid.unknownCostGenerations, 6);
assert.equal(invalid.estimatedCostUsd, null);

const isolatedTask = summarizeFounderAiCosts([
  { task: "known", estimated_cost_usd: 1 },
  { task: "unknown", estimated_cost_usd: null },
]);
assert.equal(isolatedTask.topTasks.find((task) => task.task === "unknown")?.estimatedCostUsd, null);
assert.equal(isolatedTask.estimatedCostUsd, 1);

console.log("Founder AI cost completeness checks passed.");
