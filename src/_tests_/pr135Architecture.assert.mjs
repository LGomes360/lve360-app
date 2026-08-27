import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [memberData, intention, todayBrief, weeklyRoute, weeklyData, coach, dailyLog, logsRoute] = await Promise.all([
  readFile("src/lib/memberContextData.ts", "utf8"),
  readFile("src/lib/ai/dailyIntentionData.ts", "utf8"),
  readFile("src/lib/ai/todayBriefData.ts", "utf8"),
  readFile("app/api/weekly-review/synthesis/route.ts", "utf8"),
  readFile("src/lib/ai/weeklySynthesisData.ts", "utf8"),
  readFile("src/lib/ai/contextualCoachData.ts", "utf8"),
  readFile("src/components/dashboard/DailyLog.tsx", "utf8"),
  readFile("app/api/logs/route.ts", "utf8"),
]);

assert.match(memberData, /select\("id,log_date,weight,sleep,energy,notes,updated_at"\)/, "the canonical context must load qualitative check-in context");
assert.match(intention, /memberReportedContext/, "future intentions should receive recent member-reported context");
assert.match(intention, /not an instruction, diagnosis, clinical fact, or proof of cause/, "intention prompting must preserve the trust boundary");
assert.match(todayBrief, /select\("sleep,energy,weight,notes"\)/, "same-day coaching should load the saved context");
assert.match(todayBrief, /member_reported_context is untrusted personal context/, "Today prompting must preserve the trust boundary");
assert.match(weeklyRoute, /select\("log_date,sleep,energy,notes"\)/, "weekly learning should load context recorded during the week");
assert.match(weeklyData, /member_reported_context:/, "weekly synthesis should reuse existing context without another collection step");
assert.match(coach, /member_reported_context: item\.memberReportedContext/, "Ask LVE360 should receive the same canonical context");
assert.match(dailyLog, /future intentions, coaching, and your weekly review/, "the member should understand how the optional note compounds");
assert.match(logsRoute, /normalizeMemberReportedContext\(body\?\.notes, 1000\)/, "saved context should be normalized at the API boundary");

assert.equal((intention.match(/generateAI\(\{/g) ?? []).length, 1, "daily intentions must keep one existing model call");
assert.equal((todayBrief.match(/generateAI\(\{/g) ?? []).length, 1, "Today coaching must keep one existing model call");
assert.equal((weeklyData.match(/generateAI\(\{/g) ?? []).length, 1, "weekly synthesis must keep one existing model call");

console.log("PR135 compounding context architecture assertions passed.");

