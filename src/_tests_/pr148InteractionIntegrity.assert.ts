import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimatedCostUsd, modelPrice } from "../lib/ai/modelPricing.ts";
import { extractResponsesText } from "../lib/ai/responsesText.ts";

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

assert.equal(extractResponsesText({ output_text: "  Useful answer  " }), "Useful answer");
assert.equal(extractResponsesText({
  output: [{
    id: "msg_123",
    type: "message",
    status: "completed",
    content: [{ type: "output_text", text: "Grounded answer" }],
  }],
}), "Grounded answer");
assert.equal(extractResponsesText({
  id: "resp_123",
  status: "incomplete",
  output: [{ id: "rs_internal_identifier", type: "reasoning", summary: [] }],
}), "");

const healthcheck = readFileSync("app/api/models-healthcheck/route.ts", "utf8");
assert.match(healthcheck, /const ok = mini\.ok && main\.ok && key_present/, "Preview health must fail unless both configured GPT-5.6 models pass.");
assert.doesNotMatch(healthcheck, /fallbackMini|fallbackMain/, "Preview health must not accept an older fallback model.");

console.log("PR148 model pricing assertions passed.");
