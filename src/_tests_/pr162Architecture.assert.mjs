import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const currentBlueprint = read("src/lib/currentBlueprintContext.ts");
assert.match(currentBlueprint, /from\("plan_change_events"\)/);
assert.match(currentBlueprint, /\.eq\("domain", "regimen"\)/);
assert.match(currentBlueprint, /deriveCanonicalSafetyState/);

const planData = read("src/lib/planHubData.ts");
assert.match(planData, /safety: CanonicalSafetyState/);
assert.match(planData, /safety: blueprint\?\.safety/);

const planPage = read("app/(app)/plan/page.tsx");
assert.match(planPage, /safety\.needsAttention/);
assert.match(planPage, /safety\.actionLabel/);

const today = read("src/lib/todaySurface.ts");
assert.match(today, /blueprint\?\.safety\.status === "unavailable"/);
assert.match(today, /blueprint\.safety\.needsAttention/);

const journey = read("src/components/journey/JourneyDashboard.tsx");
assert.match(journey, /blueprint\.safety\.label/);
assert.match(journey, /blueprint\.safety\.detail/);

const coach = read("src/lib/ai/contextualCoachData.ts");
assert.match(coach, /facts\.safety_review = canonicalSafety/);
assert.match(coach, /href: canonicalSafety\?\.href/);

const acknowledgementRoute = read("app/api/blueprints/[stackId]/safety-acknowledgement/route.ts");
assert.match(acknowledgementRoute, /export async function DELETE/);
assert.match(acknowledgementRoute, /safety_acknowledged_at: null/);

const workspace = read("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx");
assert.match(workspace, /Mark as needing review again/);

console.log("PR162 architecture assertions passed.");
