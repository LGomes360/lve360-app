import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, dashboard, helpers, migration] = await Promise.all([
  readFile("app/api/journey/route.ts", "utf8"),
  readFile("src/components/journey/JourneyDashboard.tsx", "utf8"),
  readFile("src/lib/journey.ts", "utf8"),
  readFile("supabase/migrations/20260802022807_preserve_blueprint_journey_rollover.sql", "utf8"),
]);

assert.match(route, /next_experiment_id/, "Journey should load the member's next chosen experiment.");
for (const label of ["Tried", "Why it mattered", "Noticed", "Chose next"]) {
  assert.ok(dashboard.includes(label), `Journey learning loop should show ${label}.`);
}
assert.match(dashboard, /Progress by life area/, "Journey should summarize relevant lifestyle domains.");
assert.match(dashboard, /not grades/, "Domain summaries should explicitly avoid grading the member.");
assert.match(dashboard, /Based on that review and your current Blueprint/, "Next-focus suggestions should combine the latest review with current Blueprint priorities.");
assert.match(helpers, /journeyDomainSummaries/, "Journey domain summaries should use existing experiment history.");
assert.match(migration, /security invoker/, "The weekly review rollover should keep the existing invoker security model.");
assert.match(migration, /p_decision in \('keep', 'shrink', 'advance'\).*current_experiment\.source_stack_id/s, "Same-practice rollover should preserve its source Blueprint.");
assert.match(migration, /p_decision in \('keep', 'shrink', 'advance'\).*current_experiment\.source_action_id/s, "Same-practice rollover should preserve its source priority.");
assert.match(migration, /else null end/, "Swapped practices should not inherit stale Blueprint provenance.");
assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/, "The rollover function should remain unavailable to public client roles.");

console.log("PR80 Journey learning-loop checks passed.");
