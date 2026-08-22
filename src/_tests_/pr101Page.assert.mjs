import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const review = read("src/components/review/WeeklyReviewClient.tsx");
const reviewRoute = read("app/api/weekly-review/route.ts");
const synthesisRoute = read("app/api/weekly-review/synthesis/route.ts");
const data = read("src/lib/ai/weeklySynthesisData.ts");
const logic = read("src/lib/weeklySynthesis.ts");
const decisionLogic = read("src/lib/weeklySynthesisDecision.ts");
const journey = read("src/components/journey/JourneyDashboard.tsx");
const today = read("src/components/dashboard/AiTodayBrief.tsx");
const migration = read("supabase/migrations/20260811034153_pr101_ai_weekly_syntheses.sql");

assert.match(today, /Hide for 3 hours/, "The snooze label must state its actual behavior.");
assert.match(review, /Get a grounded suggestion/, "AI assistance must be member initiated.");
assert.match(review, /Evidence used/, "The suggestion must cite the member data it used.");
assert.match(review, /Use this suggestion/, "Members must be able to accept the suggestion.");
assert.match(review, /edit every field below or choose a different option/i, "Members must be able to edit or reject it.");
assert.match(synthesisRoute, /premium_required/, "The synthesis must remain a paid feature.");
assert.match(data, /isLowDataWeek/, "Low-data weeks must avoid an unnecessary model call.");
assert.match(data, /code === "23505"/, "Concurrent requests must reuse one cached synthesis.");
assert.match(decisionLogic, /valueRating <= 2[\s\S]*return "swap"/, "Low usefulness must suggest testing a different practice.");
assert.match(decisionLogic, /difficulty >= 4[\s\S]*return "shrink"/, "High friction must suggest a smaller practice.");
assert.match(decisionLogic, /isAdaptiveLowData[\s\S]*completedCount < 2/, "Sparse weeks must be labeled as low data.");
assert.match(logic, /decision !== synthesis\.suggestedDecision[\s\S]*"rejected"/, "A different member choice must be recorded as rejection.");
assert.match(logic, /samePlan[\s\S]*"accepted"[\s\S]*"edited"/, "Accepted and edited suggestions must be distinguishable.");
assert.match(reviewRoute, /synthesisResponseState/, "The final member decision must be recorded.");
assert.match(journey, /Working hypothesis/, "Journey must distinguish hypotheses from observations.");
assert.match(migration, /revoke all on table public\.ai_weekly_syntheses from public, anon, authenticated/, "The table must stay server-only.");
assert.match(migration, /-- Rollback:/, "The migration must include rollback notes.");

console.log("PR101 weekly synthesis page and storage assertions passed");
