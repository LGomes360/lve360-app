import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [generator, intention, route, card, modelConfig] = await Promise.all([
  readFile("src/lib/ai/dailyIntentionData.ts", "utf8"),
  readFile("src/lib/dailyIntention.ts", "utf8"),
  readFile("app/api/daily-intention/route.ts", "utf8"),
  readFile("src/components/dashboard/DailyIntentionCard.tsx", "utf8"),
  readFile("src/lib/ai/modelConfig.ts", "utf8"),
]);

assert.match(generator, /getMemberIntelligenceContext/, "intention guidance should reuse the canonical member context");
assert.match(generator, /recentCheckIns/, "recent member signals should inform intention options when present");
assert.match(generator, /weeklyLearning/, "the latest recorded weekly learning should be available to the intention engine");
assert.match(generator, /priorIntentions/, "recent intention phrases should be available for repetition control");
assert.match(generator, /allowed_grounding_keys/, "the model should select only an available grounding source");
assert.match(generator, /grounding_key/, "the structured response should identify its grounding source");
assert.equal((generator.match(/generateAI\(\{/g) ?? []).length, 1, "PR134 must not add another model call");

assert.match(intention, /daily-intention-v2/);
assert.match(modelConfig, /promptVersion: "daily-intention-v2"/);
assert.match(route, /why_this_fits: item\.whyThisFits/, "the deterministic reason should persist with each suggestion");
assert.match(route, /grounding_key: item\.groundingKey/, "grounding provenance should persist with each suggestion");
assert.match(card, /Why this fits:/, "each choice should explain its personal fit");
assert.match(card, /Why this fits today:/, "the selected intention should retain its explanation");
assert.doesNotMatch(card, /streak|points|score/i, "intention should remain reflective rather than gamified");

console.log("PR134 personalized intention architecture assertions passed.");
