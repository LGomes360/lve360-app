import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const coachRoute = readFileSync("app/api/coach/route.ts", "utf8");
const contextRoute = readFileSync("app/api/coach/context-preferences/route.ts", "utf8");
const logsRoute = readFileSync("app/api/logs/route.ts", "utf8");
const coachData = readFileSync("src/lib/ai/contextualCoachData.ts", "utf8");
const coachUi = readFileSync("src/components/coach/AskLve360Coach.tsx", "utf8");
const settings = readFileSync("app/(app)/settings/page.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260913090000_pr175_progressive_personalization.sql", "utf8");

assert.match(coachRoute, /attachCoachPersonalizationReceipt/, "the receipt must be persisted with the answer");
assert.match(coachRoute, /coachPersonalizationFromSources/, "saved coaching history must hydrate the receipt");
assert.match(coachData, /requested\.delete\(sourceId\)/, "excluded optional context must be removed before prompting");
assert.match(contextRoute, /requirePaidApi/, "context controls must require an authenticated member");
assert.match(contextRoute, /isExcludableCoachContextId/, "the API must allow only bounded optional sources");

assert.match(coachUi, /Why this fits now/);
assert.match(coachUi, /What to notice/);
assert.match(coachUi, /When to review/);
assert.match(coachUi, /did not change your Plan or saved health records/);
assert.match(coachUi, /Do not use in future personalization/);

assert.match(settings, /Context LVE360 can remember/);
assert.match(settings, /Save correction/);
assert.match(settings, /Remove reflection/);
assert.match(logsRoute, /\.update\(\{ notes, updated_at:/, "editing remembered context must not overwrite check-in measurements");

assert.match(migration, /alter table public\.ai_coach_context_preferences enable row level security/i);
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
assert.match(migration, /revoke all on table public\.ai_coach_context_preferences from public, anon, authenticated/i);
assert.match(migration, /grant select, insert, update, delete on table public\.ai_coach_context_preferences to service_role/i);
assert.doesNotMatch(migration, /current_routine|health_profile/, "members cannot disable core safety-aware context");

console.log("PR175 architecture assertions passed.");
