import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const today = read("app/(app)/today/TodayClient.tsx");
const card = read("src/components/dashboard/DailyIntentionCard.tsx");
const route = read("app/api/daily-intention/route.ts");
const generator = read("src/lib/ai/dailyIntentionData.ts");
const gateway = read("src/lib/ai/gateway.ts");
const migration = read("supabase/migrations/20260824033047_pr126_daily_intentions.sql");

assert.ok(today.indexOf("<DailyIntentionCard") < today.indexOf("<TodayExperience"), "the daily intention must begin the active Today experience");
assert.match(card, /How do you want to show up today\?/);
assert.match(card, /This is a mindset, not another task to complete/);
assert.match(card, /Ask LVE360 for ideas/);
assert.match(card, /Use this intention/);
assert.doesNotMatch(card, /streak|points|score/i, "daily intention must not become another gamified completion metric");

assert.match(route, /requirePaidUser/);
assert.match(route, /validateDailyIntention/);
assert.match(route, /\.eq\("user_id", auth\.user\.id\)/, "every direct record lookup must be member-scoped");
assert.match(generator, /task: "daily_intention"/);
assert.match(generator, /responseFormat: RESPONSE_FORMAT/);
assert.match(generator, /capability is configured through the task gateway|generateAI/);
assert.doesNotMatch(generator, /new OpenAI|callOpenAI/, "the feature must use the centralized AI gateway");
assert.match(gateway, /ai_generation_ledger/);

assert.match(migration, /unique \(user_id, local_date\)/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.daily_intentions from public, anon, authenticated/);
assert.match(migration, /Raw member reflection prompts are never stored/);

console.log("PR126 daily intention architecture assertions passed.");
