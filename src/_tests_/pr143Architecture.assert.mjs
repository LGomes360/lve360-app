import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("src/components/journey/JourneyDashboard.tsx", "utf8");
const grounding = readFileSync("src/lib/journeyGrounding.ts", "utf8");
const synthesisData = readFileSync("src/lib/ai/weeklySynthesisData.ts", "utf8");

assert.match(dashboard, /Grounding for this weekly learning/, "Journey must render a visible weekly grounding card.");
assert.match(dashboard, /grounding\.title/);
assert.match(dashboard, /reviewedExperiment && latestReview/, "A saved review must remain grounded when an optional synthesis is absent.");
assert.match(grounding, /What this weekly learning used/);
assert.match(dashboard, /journey-week-history/);
assert.match(dashboard, /journey-check-in-patterns/);
assert.match(dashboard, /journey-reflections/);
assert.match(dashboard, /Historical connection/);
assert.match(dashboard, /target\.open = true/, "Linked Journey evidence should open its collapsed supporting detail.");
assert.match(grounding, /Member-reported context/);
assert.match(grounding, /considered without assuming cause/);
assert.match(grounding, /not proof that the practice caused a health outcome/);
assert.equal((synthesisData.match(/generateAI\(/g) ?? []).length, 1, "PR143 must preserve the existing single weekly-synthesis AI call limit.");

console.log("PR143 Journey grounding architecture assertions passed.");
