import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const openai = read("src/lib/openai.ts");
const gateway = read("src/lib/ai/gateway.ts");
const synthesis = read("src/lib/weeklySynthesis.ts");
const data = read("src/lib/ai/weeklySynthesisData.ts");
const config = read("src/lib/ai/modelConfig.ts");

assert.match(openai, /body\.text = \{ format: opts\.responseFormat \}/, "The Responses API must receive the JSON schema format.");
assert.match(gateway, /responseFormat: options\.responseFormat/, "The task gateway must preserve the response contract.");
assert.match(synthesis, /WEEKLY_SYNTHESIS_RESPONSE_FORMAT/);
assert.match(synthesis, /additionalProperties: false/);
assert.match(synthesis, /required: \["observation", "hypothesis"\]/);
assert.match(data, /responseFormat: WEEKLY_SYNTHESIS_RESPONSE_FORMAT/);
assert.match(synthesis, /weekly-review-synthesis-v5/);
assert.match(config, /weekly_review_synthesis:[\s\S]*weekly-review-synthesis-v5/);
assert.match(data, /generated \? "ai" : "fallback"/, "The safe deterministic fallback must remain available.");

console.log("PR120 structured weekly synthesis checks passed.");
