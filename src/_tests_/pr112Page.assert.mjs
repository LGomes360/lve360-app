import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("app/(app)/today/TodayClient.tsx", "utf8");
const today = readFileSync("src/components/dashboard/TodayExperience.tsx", "utf8");
const surface = readFileSync("src/lib/todaySurface.ts", "utf8");
const brief = readFileSync("src/lib/todayBrief.ts", "utf8");

assert.ok(client.indexOf("<TodayExperience") < client.indexOf("<AiTodayBrief"), "The saved focused action must appear before supporting AI coaching.");
assert.match(today, /deriveTodayBlueprintNotice/, "Today must derive one canonical Blueprint notice.");
assert.equal((today.match(/<TodayBlueprintNoticeBanner/g) ?? []).length, 2, "One renderer may be placed by urgency, without rendering duplicate notices in the same state.");
assert.doesNotMatch(today, /function CurrentBlueprintPanel/, "The large duplicated Blueprint summary must leave Today.");
assert.match(today, /<details[\s\S]*Blueprint connection/, "Blueprint context must remain available as a collapsed secondary disclosure.");
assert.doesNotMatch(today, /Your Blueprint changed after this practice was chosen/, "A second standalone Blueprint warning strip must not remain.");
assert.doesNotMatch(today, /Your weekly review is ready\.<\/strong>/, "The focused-action card must not duplicate the AI weekly-review prompt.");
assert.match(surface, /safety_status === "error"[\s\S]*!blueprint\.safety_acknowledged/, "Urgent safety interruption must be explicit and narrow.");
assert.match(brief, /!context\.blueprint\?\.urgentSafetyInterruption/, "Normal stale state must not suppress the useful daily brief.");
assert.doesNotMatch(brief, /&& !context\.blueprint\?\.needsRefresh/, "Blueprint maintenance must not block lifestyle coaching.");

console.log("PR112 Today action hierarchy architecture checks passed.");
