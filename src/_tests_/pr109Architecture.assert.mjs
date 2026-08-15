import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/coach/route.ts", "utf8");
const coach = readFileSync("src/lib/ai/contextualCoachData.ts", "utf8");
const intent = readFileSync("src/lib/contextualCoach.ts", "utf8");
const modelConfig = readFileSync("src/lib/ai/modelConfig.ts", "utf8");

assert.match(route, /classifyCoachRequest\(question\)/, "The API must resolve intent and constraints before context retrieval.");
assert.match(route, /buildCoachContext\(auth\.user\.id, page, question, routing\)/, "The routing decision must control context retrieval.");
assert.match(route, /console\.info\("\[coach\.route\]"/, "Detailed intent and constraints must be observable without logging the question or health facts.");
assert.match(route, /storedCoachIntent\(diagnostics\.intent\)/, "Detailed routing must remain compatible with the deployed diagnostics constraint.");

assert.match(coach, /getMemberIntelligenceContext\(userId\)/, "Ask LVE360 must consume the PR108 canonical member context.");
assert.doesNotMatch(coach, /getCurrentRegimen\(/, "Ask LVE360 must not rebuild a parallel regimen context.");
assert.doesNotMatch(coach, /getCurrentBlueprintContext\(/, "Ask LVE360 must not rebuild a parallel Blueprint context.");
assert.match(coach, /BEHAVIORAL_COACHING:\s*\["weekly_practice", "recent_check_ins", "goals", "preferences", "recent_coaching"\]/, "Behavioral coaching must not retrieve supplement evidence by default.");
assert.match(coach, /SAFETY_REVIEW:\s*\["safety_review", "current_routine", "health_profile"\]/, "Safety review must use deterministic findings and member context.");
assert.match(coach, /deterministicCoachTask\(routing, context\.memberContext, question\)/, "Deterministic tasks must run before model generation.");

assert.match(intent, /preserveMedicationPlan/);
assert.match(intent, /preserveSupplementPlan/);
assert.match(intent, /CURRENT_REGIMEN_LOOKUP/);
assert.match(intent, /OUT_OF_SCOPE/);
assert.match(intent, /contextual-coach-v3/);
assert.match(modelConfig, /promptVersion:\s*"contextual-coach-v3"/, "Runtime ledger and saved-turn prompt versions must agree.");

console.log("PR109 intent-first coaching architecture checks passed.");
