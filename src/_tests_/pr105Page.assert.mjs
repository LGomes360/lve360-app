import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs.readFileSync("app/api/coach/route.ts", "utf8");
const coach = fs.readFileSync("src/components/coach/AskLve360Coach.tsx", "utf8");
const context = fs.readFileSync("src/lib/ai/contextualCoachData.ts", "utf8");
const header = fs.readFileSync("src/components/DashboardHeader.tsx", "utf8");
const modelConfig = fs.readFileSync("src/lib/ai/modelConfig.ts", "utf8");
const accountExport = fs.readFileSync("app/api/account/export/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260812024830_pr105_contextual_coaching.sql", "utf8");
const sourceMigration = fs.readFileSync("supabase/migrations/20260812030553_pr105_deterministic_coaching_source.sql", "utf8");

assert.match(header, /AskLve360Coach/, "The paid dashboard must expose coaching globally.");
assert.match(coach, /What I used/, "Every grounded answer must let the member inspect its sources.");
assert.match(coach, /cannot diagnose or silently change saved records/i);
assert.match(coach, /useful/);
assert.match(coach, /not_useful/);
assert.match(context, /Saved LVE360 records describe this member/i);
assert.match(context, /Use the supplied curated evidence_options/i);
assert.match(context, /deterministicTodayStep/, "Today's smallest-step prompt must prefer the active weekly practice deterministically.");
assert.match(context, /deterministicPlanLookup/, "Routine lookups must organize current records without inventing health effects.");
assert.match(context, /deterministicJourneyPattern/, "Common Journey questions must use transparent recorded averages rather than causal inference.");
assert.match(context, /sleep_rating_out_of_5/, "Check-in scales must be explicit so ratings cannot be misread as hours.");
assert.match(context, /INTENT_SOURCE_IDS/, "Each intent must receive only relevant source context.");
assert.match(context, /generateAI\(\{[\s\S]*task: "contextual_coach"/, "Coaching must use the canonical AI gateway.");
assert.match(modelConfig, /contextual_coach:[\s\S]*capability: "mini"/, "Coaching must default to the cost-efficient model capability.");
assert.match(api, /LVE_AI_COACH_MONTHLY_TURNS|coachBudget/);
assert.match(api, /ai_generation_ledger/);
assert.doesNotMatch(api, /current_regimen_items"\)\.update|weekly_experiments"\)\.update|user_preferences"\)\.update/, "Coaching must not autonomously change member records.");
assert.match(accountExport, /ai_coaching_turns/, "Members must be able to export their coaching history.");
assert.match(migration, /alter table public\.ai_coaching_turns enable row level security/i);
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
assert.match(migration, /revoke all on table public\.ai_coaching_turns from public, anon, authenticated/i);
assert.match(migration, /grant select on table public\.ai_coaching_turns to authenticated/i);
assert.match(migration, /grant select, insert, update, delete on table public\.ai_coaching_turns to service_role/i);
assert.match(sourceMigration, /'ai', 'deterministic', 'fallback', 'safety', 'budget'/, "Deterministic answers must not be misreported as paid AI generations.");

console.log("PR105 paid coach UI, budget, privacy, and RLS assertions passed.");
