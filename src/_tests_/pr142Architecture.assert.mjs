import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync("src/components/dashboard/AiTodayBrief.tsx", "utf8");
const data = readFileSync("src/lib/ai/todayBriefData.ts", "utf8");
const brief = readFileSync("src/lib/todayBrief.ts", "utf8");

assert.match(component, /Grounding for today’s recommendation/, "Today must render a visible grounding card.");
assert.match(component, /grounding\.title/);
assert.match(component, /Historical connection/);
assert.match(data, /groundingDetails: todayRecommendationGrounding/);
assert.match(data, /connection: connection \?/);
assert.match(brief, /Saved weekly practice/);
assert.match(brief, /Today’s check-in/);
assert.match(brief, /Current Blueprint safety status/);
assert.equal((data.match(/generateAI\(/g) ?? []).length, 1, "PR142 must preserve the existing single Today brief AI call limit.");

console.log("PR142 Today grounding architecture assertions passed.");
