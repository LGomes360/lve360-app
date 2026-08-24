import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const blueprint = readFileSync("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx", "utf8");
const today = readFileSync("src/components/dashboard/TodayExperience.tsx", "utf8");

assert.doesNotMatch(blueprint, /Choose one focus for this week/);
assert.doesNotMatch(blueprint, /Start this weekly practice/);
assert.match(today, /Weekly practice momentum/);
assert.match(today, /Weekly promise/);
assert.match(today, /weeklyMomentum/);
assert.match(today, /Minimum version complete/);
assert.match(today, /planned practice completions/);

console.log("PR94 Today momentum assertions passed.");
