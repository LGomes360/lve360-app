import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260808221918_pr85_recommendation_decisions.sql", "utf8");
const decisionData = fs.readFileSync("src/lib/recommendationDecisionData.ts", "utf8");
const routineData = fs.readFileSync("src/lib/routineData.ts", "utf8");
const routineClient = fs.readFileSync("app/(app)/routine/RoutineClient.tsx", "utf8");
const blueprintPage = fs.readFileSync("app/(app)/blueprints/[stackId]/page.tsx", "utf8");
const blueprintClient = fs.readFileSync("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx", "utf8");
const today = fs.readFileSync("src/components/dashboard/TodayExperience.tsx", "utf8");
const decisionApi = fs.readFileSync("app/api/recommendations/decision/route.ts", "utf8");

assert.match(migration, /unique \(user_id, recommendation_key, context_fingerprint\)/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /auth\.uid\(\)\) = user_id/i);
assert.match(migration, /grant select on table public\.recommendation_decisions to authenticated/i);
assert.match(migration, /service_role/i);
assert.match(decisionData, /onConflict: "user_id,recommendation_key,context_fingerprint"/);
assert.match(decisionData, /isMissingDecisionTable/, "A code deployment before migration must fail soft rather than breaking paid pages.");
assert.match(routineData, /isActionableRecommendationStatus/, "Routine and Today counts must use persisted decision state.");
assert.match(routineClient, /Ask my clinician/);
assert.match(routineClient, /Not now/);
assert.match(routineClient, /Dismiss/);
assert.match(blueprintPage, /getStackRecommendationDecisions/);
assert.match(blueprintClient, /id="recommendation-decisions"/);
assert.match(blueprintClient, /Possible overlap/);
assert.match(blueprintClient, /Add to Routine/);
assert.match(today, /"recommendation-decisions" : "recommendation-report"/, "Today must link to the live actions when present and the dated report otherwise.");
assert.match(decisionApi, /isMemberRecommendationDecision/);

console.log("PR85 page and persistence assertions passed.");
