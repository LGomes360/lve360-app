import assert from "node:assert/strict";
import fs from "node:fs";

const memberData = fs.readFileSync("src/lib/memberContextData.ts", "utf8");
const memberContext = fs.readFileSync("src/lib/memberContext.ts", "utf8");
const coachData = fs.readFileSync("src/lib/ai/contextualCoachData.ts", "utf8");
const coachIntent = fs.readFileSync("src/lib/coachIntent.ts", "utf8");
const route = fs.readFileSync("app/api/coach/route.ts", "utf8");

assert.match(memberData, /\.from\("plan_change_events"\)[\s\S]*?\.select\("id,domain,entity_type,entity_id,change_type,source,change_summary,created_at"\)/, "Canonical member context must read the append-only Plan ledger.");
assert.match(memberContext, /recentPlanChanges: MemberContextSection<MemberPlanChangeContext\[\]>/, "Plan history must be part of canonical member context.");
assert.match(coachData, /CURRENT_PLAN_LOOKUP: \["current_plan", "plan_change_history"\]/, "Plan lookup must retrieve Plan state and confirmed history, not a supplement-only routine projection.");
assert.match(coachData, /href: "\/plan#plan-changes-heading"/, "Visible provenance must link to the confirmed Plan history.");
assert.match(coachIntent, /This is a read-only history/);
assert.match(coachIntent, /Nothing was changed by this answer/);
assert.doesNotMatch(route, /from\("plan_change_events"\)[\s\S]{0,120}\.(?:insert|update|delete|upsert)\(/, "Ask LVE360 must never mutate the Plan ledger.");

console.log("PR174 Coach Reliability Gate architecture checks passed.");
