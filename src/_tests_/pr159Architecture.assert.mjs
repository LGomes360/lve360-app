import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [client, api, migration, journeyApi, journey, journeyUi] = await Promise.all([
  readFile("src/components/review/WeeklyReviewClient.tsx", "utf8"),
  readFile("app/api/weekly-review/route.ts", "utf8"),
  readFile("supabase/migrations/20260901004820_pr159_practice_adaptation.sql", "utf8"),
  readFile("app/api/journey/route.ts", "utf8"),
  readFile("src/lib/journey.ts", "utf8"),
  readFile("src/components/journey/JourneyDashboard.tsx", "utf8"),
]);

for (const adaptation of ["continue", "decrease", "increase", "modify", "pause", "replace", "graduate"]) {
  assert.match(client, new RegExp(`value: "${adaptation}"`), `Weekly Review must offer ${adaptation}.`);
  assert.match(migration, new RegExp(`'${adaptation}'`), `The database must accept ${adaptation}.`);
}

assert.match(client, /Why is this the right next decision\?/, "The member must provide one short rationale.");
assert.match(client, /maxLength=\{500\}/, "The rationale must remain bounded in the UI.");
assert.match(api, /cleanAdaptationRationale\(body\?\.rationale\)/, "The API must sanitize the rationale.");
assert.match(api, /validateAdaptationPlan\(experiment, adaptation, body\?\.next_plan\)/, "The API must validate the selected transition against the proposed plan.");
assert.match(api, /p_adaptation_kind: adaptation/, "The exact confirmed transition must reach the database transaction.");
assert.match(api, /p_adaptation_rationale: rationale/, "The confirmed rationale must reach the database transaction.");

assert.match(migration, /add column adaptation_kind text/, "Reviews must preserve the canonical adaptation.");
assert.match(migration, /add column adaptation_rationale text/, "Reviews must preserve the member rationale.");
assert.match(migration, /security invoker/, "The migration functions must retain invoker security.");
assert.match(migration, /set_config\('lve360\.practice_adaptation_source', 'complete_weekly_review', true\)/, "The atomic review path must suppress duplicate generic trigger events.");
assert.match(migration, /insert into public\.plan_change_events/, "Every confirmed transition must emit a Plan history event.");
assert.match(migration, /p_adaptation_kind, 'weekly_review', event_summary/, "The history event must carry the exact transition and weekly-review source.");
assert.match(migration, /btrim\(p_adaptation_rationale\)/, "The stored event and review must carry the member rationale.");
assert.match(migration, /from public, anon, authenticated/, "Browser roles must not execute the transactional function directly.");
assert.match(migration, /to service_role/, "Only the trusted server role may execute the transactional function.");
assert.doesNotMatch(migration, /grant execute[\s\S]{0,240}to authenticated/, "The migration must not restore authenticated execute access.");

assert.match(journeyApi, /adaptation_kind, adaptation_rationale/, "Journey must load the attributable transition fields.");
assert.match(journey, /adaptation_kind:[\s\S]*adaptation_rationale:/, "Journey types must carry the attributable transition fields.");
assert.match(journeyUi, />Why<\/dt>/, "Journey must explain why a member changed the Practice.");
assert.match(journeyUi, /journeyReviewDecision/, "Journey must prefer canonical transitions while retaining legacy history.");

console.log("PR159 attributable Practice adaptation architecture assertions passed.");
