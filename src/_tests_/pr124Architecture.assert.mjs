import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const data = read("src/lib/ai/contextualCoachData.ts");
const fallback = read("src/lib/coachFallback.ts");

assert.match(data, /buildGroundedCoachFallback/, "The final safety net must use the grounded recovery builder.");
assert.match(data, /relevantFallbackMissingContext/, "Fallback limitations must be relevant to the current question and intent.");
assert.match(data, /missingContextRequirements\(context\.memberContext\)/, "Fallback limitations must come from actual missing member context.");
assert.match(data, /narrowSafeFallback\(question, context\)/g, "Every final fallback path must retain the member's question.");
assert.match(fallback, /I can verify/, "The fallback should preserve a supported partial answer when possible.");
assert.match(fallback, /The most useful missing information is/, "The fallback must explain missing context plainly.");
assert.match(fallback, /Next step:/, "The fallback must offer a concrete recovery path.");
assert.match(fallback, /saved information and Routine are unchanged/, "The no-mutation boundary must remain explicit.");
assert.match(fallback, /clinician or healthcare provider/, "Safety recovery must retain professional escalation.");
assert.doesNotMatch(fallback, /pharmacist/i, "Member-facing fallback copy should use preferred terminology.");

console.log("PR124 coaching fallback architecture assertions passed.");
