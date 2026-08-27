import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const coach = readFileSync("src/components/coach/AskLve360Coach.tsx", "utf8");
const context = readFileSync("src/lib/ai/contextualCoachData.ts", "utf8");

assert.match(coach, /CoachGroundingCard/, "Ask LVE360 must render the visible grounding card.");
assert.doesNotMatch(coach, />What I used</, "Grounding must not remain hidden behind the old generic disclosure.");
assert.match(coach, /coachGroundingTitle/);
assert.match(coach, /Your saved LVE360 records/);
assert.match(coach, /Maintained evidence/);
assert.match(coach, /Safety rules checked/);
assert.match(context, /kind: "evidence"/);
assert.match(context, /evidence_strength: option\.evidenceStrength/);
assert.match(context, /review_status: option\.reviewStatus/);
assert.match(context, /kind: "safety"/);
assert.equal((context.match(/generateAI\(/g) ?? []).length, 2, "PR141 must preserve the existing primary plus bounded repair call limit.");

console.log("PR141 coaching grounding architecture assertions passed.");
