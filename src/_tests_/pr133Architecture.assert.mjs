import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [todayClient, dailyLog, todayExperience, briefData] = await Promise.all([
  readFile("app/(app)/today/TodayClient.tsx", "utf8"),
  readFile("src/components/dashboard/DailyLog.tsx", "utf8"),
  readFile("src/components/dashboard/TodayExperience.tsx", "utf8"),
  readFile("src/lib/ai/todayBriefData.ts", "utf8"),
]);
const logsRoute = await readFile("app/api/logs/route.ts", "utf8");

const intentionIndex = todayClient.indexOf("<DailyIntentionCard");
const checkInIndex = todayClient.indexOf('<section id="daily-log"');
const decisionIndex = todayClient.indexOf("<TodayExperience");
const routineIndex = todayClient.indexOf("<TodayRoutineAgenda");

assert.ok(intentionIndex >= 0, "Today should begin with the daily intention.");
assert.ok(checkInIndex > intentionIndex, "The current-state check-in should follow the intention.");
assert.ok(decisionIndex > checkInIndex, "The best-next-step decision should follow the check-in.");
assert.ok(routineIndex > decisionIndex, "The routine summary should remain supporting detail after the daily decision.");
assert.match(todayClient, /decisionReady=\{decisionReady\}/, "Today should gate lifestyle coaching until the check-in is saved or skipped.");
assert.match(todayClient, /preferMinimumVersion=\{preferMinimumVersion\}/, "The structured check-in should be able to select the saved hard-day version.");

assert.doesNotMatch(dailyLog, /type="range"/, "Sleep and energy should not use range sliders.");
for (const label of ["Very poor", "Restorative", "Very low", "Steady", "High"]) {
  assert.ok(dailyLog.includes(label), `The discrete check-in should include the choice: ${label}.`);
}
assert.match(dailyLog, /Save check-in and see my next step/, "The save action should explain the value exchange.");
assert.match(dailyLog, /Continue without a check-in/, "Members should be allowed to continue with disclosed limited context.");
assert.match(dailyLog, /\/api\/logs\?date=/, "The visible check-in should load the server-authoritative daily record.");
assert.doesNotMatch(dailyLog, /createClientComponentClient/, "The check-in should not bypass the server's public-user identity mapping.");
assert.match(dailyLog, /date \?\? localDateString\(\)/, "The visible check-in and Today Brief should use the same member-local calendar date.");
assert.doesNotMatch(dailyLog, /toISOString\(\)\.slice\(0, 10\)/, "The check-in should not switch to tomorrow at UTC midnight.");
assert.match(logsRoute, /const userId = entitlement\.user\.id/, "Daily logs should use the paid dashboard's canonical signed-in user id.");
assert.doesNotMatch(logsRoute, /\.eq\("email"/, "Daily logs should not remap a signed-in account by email.");

assert.match(todayExperience, /if \(!decisionReady\)/, "TodayExperience should withhold non-urgent lifestyle coaching before the check-in decision.");
assert.match(todayExperience, /blueprintNotice\?\.tone !== "urgent"/, "Urgent Blueprint safety should remain visible before lifestyle coaching.");
assert.match(todayExperience, /I did today&apos;s smaller version/, "The adjusted minimum version should become the primary completion action.");

assert.match(briefData, /from\("logs"\).*select\("sleep,energy,weight(?:,notes)?"\)/s, "The Today Brief context should load today's structured check-in.");
assert.match(briefData, /today_check_in: context\.checkIn/, "Bounded AI wording should receive the structured check-in.");

console.log("PR133 Today listens-first architecture assertions passed.");
