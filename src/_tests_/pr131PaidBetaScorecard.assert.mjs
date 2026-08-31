import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const analyticsTypes = read("src/lib/productAnalyticsTypes.ts");
const eventRoute = read("app/api/analytics/event/route.ts");
const blueprint = read("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx");
const migration = read("supabase/migrations/20260826004608_pr131_paid_beta_learning_scorecard.sql");
const documentation = read("docs/analytics-event-taxonomy.md");

for (const eventName of ["recommendation_viewed", "recommendation_reason_opened", "blueprint_handoff_ready", "blueprint_handoff_retry"]) {
  assert.match(analyticsTypes, new RegExp(`"${eventName}"`), `${eventName} must be part of the typed event contract.`);
  assert.match(migration, new RegExp(`'${eventName}'`), `${eventName} must be accepted by the database constraint.`);
}

for (const clientEvent of ["recommendation_viewed", "recommendation_reason_opened"]) {
  assert.match(eventRoute, new RegExp(`"${clientEvent}"`), `${clientEvent} must be accepted by the client event route.`);
  assert.match(blueprint, new RegExp(`event_name: "${clientEvent}"`), `${clientEvent} must be emitted by the Blueprint experience.`);
}

assert.match(blueprint, /href=\{recommendationTarget\}[\s\S]*recommendation_reason_opened/, "Opening the recommendation decision layer must record reason engagement.");
assert.doesNotMatch(blueprint, /<details/, "Recommendation reasons must stay readable without restoring dense accordions.");
assert.match(migration, /create or replace view analytics\.paid_beta_learning_scorecard/);
assert.match(migration, /with \(security_invoker = true\)/);
assert.match(migration, /revoke all on analytics\.paid_beta_learning_scorecard from public, anon, authenticated/);
assert.match(migration, /grant select on analytics\.paid_beta_learning_scorecard to service_role/);

for (const metric of [
  "blueprint_to_paid_conversion",
  "activation",
  "intention_set",
  "recommendation_viewed",
  "reason_opened",
  "action_completed",
  "action_adapted",
  "action_skipped",
  "ask_lve360_usefulness",
  "day_7_return",
  "second_week_start",
  "subscription_active",
  "subscription_cancelled",
]) {
  assert.match(migration, new RegExp(`'${metric}'`), `${metric} must appear in the operator scorecard.`);
}

assert.match(documentation, /Paid-beta learning scorecard/);
assert.match(documentation, /analytics\.paid_beta_learning_scorecard/);

console.log("PR131 paid-beta scorecard checks passed.");
