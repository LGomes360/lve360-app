import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs.readFileSync("app/api/coach/route.ts", "utf8");
const coach = fs.readFileSync("src/components/coach/AskLve360Coach.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260825030339_pr130_coach_allowance_adjustments.sql", "utf8");
const topUp = fs.readFileSync("scripts/top-up-coach-allowance.mjs", "utf8");
const operations = fs.readFileSync("docs/coach-allowance-operations.md", "utf8");

assert.match(api, /ai_coach_allowance_adjustments/);
assert.match(api, /neq\("generation_status", "limited"\)/, "Denied attempts must not consume a future testing top-up.");
assert.match(api, /coachUsageSummary/);
assert.match(api, /currentUsage\.exhausted/);
assert.match(coach, /questions left/);
assert.match(coach, /Resets/);
assert.match(coach, /Open Today/);
assert.match(coach, /Review Blueprint/);
assert.match(coach, /Contact support/);
assert.match(coach, /approved testing question/);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.ai_coach_allowance_adjustments from public, anon, authenticated/i);
assert.match(migration, /grant select, insert, update, delete on table public\.ai_coach_allowance_adjustments to service_role/i);
assert.match(migration, /additional_turns between 0 and 100/i);
assert.doesNotMatch(migration, /to authenticated[\s\S]*using/i, "Members must not be able to approve their own testing adjustments.");
assert.match(topUp, /user\.tier !== "premium" && user\.tier !== "trial"/);
assert.match(topUp, /productionCostCeilingUnchanged: true/);
assert.match(topUp, /--granted-by/);
assert.match(operations, /production dollar ceiling remains unchanged/i);
assert.match(operations, /must not contain health information/i);

console.log("PR130 allowance transparency and controlled top-up architecture passed.");
