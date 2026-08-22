import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const coach = read("../components/coach/AskLve360Coach.tsx");
const coachRoute = read("../../app/api/coach/route.ts");
const actionRoute = read("../../app/api/coach/actions/route.ts");
const review = read("../components/review/WeeklyReviewClient.tsx");
const reviewRoute = read("../../app/api/weekly-review/route.ts");
const migration = read("../../supabase/migrations/20260816023219_pr114_controlled_coach_actions.sql");
const coachData = read("../lib/ai/contextualCoachData.ts");

assert.match(coach, /Preview as next week&apos;s practice/);
assert.match(coach, /Save for weekly review/);
assert.match(coach, /It does not change your current week or any saved health record/);
assert.match(actionRoute, /action !== "confirm" && action !== "cancel"/);
assert.match(actionRoute, /eq\("user_id", auth\.user\.id\)/);
assert.match(coachRoute, /saveActionProposal/);
assert.match(coachData, /smallest\|next step\|today\|right now/);
assert.doesNotMatch(coachData, /smallest\|next\|today\|right now/);
assert.match(coachData, /valid JSON shape/);
assert.doesNotMatch(coachData, /\{type:'weekly_practice'/);
assert.match(review, /Saved from Ask LVE360/);
assert.match(review, /Use this for next week/);
assert.match(reviewRoute, /coach_action_proposal_id/);
assert.match(reviewRoute, /decision !== "swap"/);
assert.match(migration, /enable row level security/g);
assert.match(migration, /revoke insert, update, delete on table public\.coach_action_proposals from authenticated/);
assert.match(migration, /coach_action_proposals_one_confirmed_per_user/);
assert.match(migration, /coach_action_proposals_status_audit/);
assert.match(migration, /status in \('proposed', 'confirmed', 'cancelled', 'applied'\)/);

console.log("PR114 controlled action architecture assertions passed.");
