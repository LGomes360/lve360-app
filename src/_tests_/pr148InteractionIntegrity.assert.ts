import assert from "node:assert/strict";
import { estimatedCostUsd, modelPrice } from "../lib/ai/modelPricing.ts";

assert.deepEqual(modelPrice("gpt-5.6-terra"), { input: 2, cachedInput: 0.2, output: 12 });
assert.deepEqual(modelPrice("gpt-5.6-luna"), { input: 0.2, cachedInput: 0.02, output: 1.2 });
assert.deepEqual(modelPrice("gpt-5.6-terra-2026-08-01"), { input: 2, cachedInput: 0.2, output: 12 });
assert.equal(modelPrice("unpriced-model"), undefined);

assert.equal(
  estimatedCostUsd("gpt-5.6-terra", {
    prompt_tokens: 1_000_000,
    cached_tokens: 250_000,
    completion_tokens: 100_000,
  }),
  2.75
);
assert.equal(
  estimatedCostUsd("gpt-5.6-luna", {
    prompt_tokens: 1_000_000,
    cached_tokens: 250_000,
    completion_tokens: 100_000,
  }),
  0.275
);
assert.equal(estimatedCostUsd("unpriced-model", { prompt_tokens: 100 }), null);

console.log("PR148 model pricing assertions passed.");
