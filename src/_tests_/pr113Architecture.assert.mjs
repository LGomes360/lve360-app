import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260816000245_pr113_practice_connections.sql");
const activation = read("app/api/activation/route.ts");
const onboarding = read("app/onboarding/OnboardingHandoffClient.tsx");
const today = read("src/components/dashboard/TodayExperience.tsx");
const journey = read("src/components/journey/JourneyDashboard.tsx");
const review = read("src/components/review/WeeklyReviewClient.tsx");
const brief = read("src/lib/ai/todayBriefData.ts");
const member = read("src/lib/memberContext.ts");

for (const column of ["connection_type", "goal_id", "goal_key", "goal_label_snapshot"]) {
  assert.match(migration, new RegExp(`add column ${column}`), `Migration must add ${column}.`);
}
assert.match(migration, /on delete set null/i, "Deleting a saved goal must preserve the weekly record through its snapshot.");
assert.match(migration, /preserves_practice.*keep.*shrink.*advance/s, "Same-practice rollovers must preserve explicit connections.");
assert.match(migration, /case when preserves_practice then current_experiment\.connection_type else 'independent'/, "Swapped practices must not inherit old links.");
assert.match(migration, /Rollback:/, "Migration must document rollback behavior.");

assert.match(activation, /practiceGoalOptions/, "Activation must load deterministic saved-goal options.");
assert.match(activation, /choose_current_goal/, "Activation must reject stale or invented goal keys.");
assert.match(activation, /connectionType\(Boolean\(selectedGoal\), keepsBlueprint\)/, "Activation must derive linkage only from explicit selections and stored Blueprint provenance.");
assert.match(onboarding, /Why does this practice matter this week\?/, "Weekly setup must ask for the connection explicitly.");
assert.match(onboarding, /Independent choice for this week/, "Members must be able to choose no goal link.");

for (const [surface, source] of [["Today", today], ["Journey", journey], ["weekly review", review]]) {
  assert.match(source, /Why (?:this matters|it mattered)/, `${surface} must explain the same explicit connection.`);
}
assert.match(brief, /explicit_practice_connection/, "The daily AI brief must receive the deterministic connection.");
assert.match(member, /explicitly linked to a current saved goal/, "Canonical member context must expose current goal linkage.");
assert.doesNotMatch(journey, /was your chosen focus/, "Journey must not infer why a practice mattered from identity text.");

console.log("PR113 practice-connection architecture checks passed.");
