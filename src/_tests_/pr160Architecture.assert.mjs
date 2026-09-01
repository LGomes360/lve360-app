import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, journey, dashboard, packageJsonSource] = await Promise.all([
  readFile("app/api/journey/route.ts", "utf8"),
  readFile("src/lib/journey.ts", "utf8"),
  readFile("src/components/journey/JourneyDashboard.tsx", "utf8"),
  readFile("package.json", "utf8"),
]);
const packageJson = JSON.parse(packageJsonSource);

assert.match(route, /\.from\("plan_change_events"\)/, "Journey must read the canonical append-only Plan ledger.");
assert.match(route, /before_state,after_state/, "Journey must load bounded before-and-after state for confirmed changes.");
assert.match(route, /plan_changes: \(planChanges \?\? \[\]\)/, "Journey must return confirmed changes to the paid surface.");
assert.match(journey, /journeyPlanChangeForReview/, "Weekly learning must resolve the exact attributable change event.");
assert.match(journey, /journeyChangeDetails/, "Journey must expose only a bounded, human-readable before-and-after diff.");
assert.match(dashboard, /What changed \(confirmed\)/);
assert.match(dashboard, /What the weekly review recorded/);
assert.match(dashboard, /Historical review; no linked ledger event/);
assert.match(dashboard, /What you followed through on/);
assert.match(dashboard, /What you observed/);
assert.match(dashboard, /What remains unknown/);
assert.match(dashboard, /One next decision/);
assert.match(dashboard, /What actually changed/);
assert.match(dashboard, /changes saved to your Plan/);
assert.match(dashboard, /Observations and generated insights remain separate from Plan facts/);
assert.match(dashboard, /not a causal claim/);
assert.match(dashboard, /Other influences may have changed at the same time/);
assert.doesNotMatch(
  dashboard,
  /At the end of this week, decide whether to continue, decrease, increase, modify, pause, replace, or graduate/,
  "The primary story must offer one review decision instead of an unprioritized seven-option list.",
);
assert.equal(
  packageJson.scripts["qa:pr160"],
  "node --experimental-strip-types src/_tests_/pr160JourneyIntelligence.assert.ts && node src/_tests_/pr160Architecture.assert.mjs && npm run qa:pr159",
);

console.log("PR160 Journey change intelligence architecture assertions passed.");
