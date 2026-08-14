import assert from "node:assert/strict";

import {
  cleanCoachQuestion,
  coachBoundaryAnswer,
  coachPageFromPath,
  coachSafetyBoundary,
  isCoachAnswerSafe,
  parseCoachAnswer,
} from "../lib/contextualCoach.ts";
import { coachBudget } from "../lib/contextualCoachBudget.ts";

assert.equal(coachPageFromPath("/today"), "today");
assert.equal(coachPageFromPath("/blueprints/abc"), "blueprint");
assert.equal(coachPageFromPath("/unknown"), "other");
assert.equal(cleanCoachQuestion("  help   me today  "), "help me today");
assert.equal(cleanCoachQuestion("no"), null);

assert.equal(coachSafetyBoundary("Do I have diabetes?"), "diagnosis");
assert.equal(coachSafetyBoundary("Should I increase my medication dose?"), "regimen_change");
assert.equal(coachSafetyBoundary("Should I take B12?"), null);
assert.equal(coachSafetyBoundary("Help me prepare questions about my medication."), null);
assert.equal(coachSafetyBoundary("Do I have a weekly practice?"), null);
assert.equal(coachSafetyBoundary("I have chest pain and can't breathe"), "emergency");
assert.match(coachBoundaryAnswer("regimen_change"), /cannot direct a medication or hormone change/i);
assert.match(coachBoundaryAnswer("diagnosis"), /cannot diagnose/i);
assert.equal(isCoachAnswerSafe("You should increase your medication dose."), false);
assert.equal(isCoachAnswerSafe("You should take a 10-minute walk after lunch."), true);
assert.equal(isCoachAnswerSafe("You have diabetes."), false);
assert.equal(isCoachAnswerSafe("This can help improve digestion and energy levels."), true);
assert.equal(isCoachAnswerSafe("This keeps the step tied to your weekly plan."), true);

const parsed = parseCoachAnswer(
  JSON.stringify({ answer: "Your recorded weekly practice is the best place to begin.", source_ids: ["weekly_practice", "invented"] }),
  new Set(["weekly_practice"]),
);
assert.deepEqual(parsed, {
  answer: "Your recorded weekly practice is the best place to begin.",
  sourceIds: ["weekly_practice"],
});
assert.equal(parseCoachAnswer("not json", new Set()), null);

const previousTurns = process.env.LVE_AI_COACH_MONTHLY_TURNS;
const previousCost = process.env.LVE_AI_COACH_MONTHLY_COST_USD;
process.env.LVE_AI_COACH_MONTHLY_TURNS = "12";
process.env.LVE_AI_COACH_MONTHLY_COST_USD = "0.75";
assert.deepEqual(coachBudget(), { monthlyTurns: 12, monthlyCostUsd: 0.75 });
if (previousTurns === undefined) delete process.env.LVE_AI_COACH_MONTHLY_TURNS;
else process.env.LVE_AI_COACH_MONTHLY_TURNS = previousTurns;
if (previousCost === undefined) delete process.env.LVE_AI_COACH_MONTHLY_COST_USD;
else process.env.LVE_AI_COACH_MONTHLY_COST_USD = previousCost;

console.log("PR105 contextual coach safety and grounding assertions passed.");
