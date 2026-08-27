import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const todayClient = readFileSync("app/(app)/today/TodayClient.tsx", "utf8");
const todayAgenda = readFileSync("src/components/dashboard/TodayRoutineAgenda.tsx", "utf8");
const doseChecklist = readFileSync("app/(app)/routine/TodayDoses.tsx", "utf8");
const routineClient = readFileSync("app/(app)/routine/RoutineClient.tsx", "utf8");

assert.match(todayClient, /<TodayRoutineAgenda\s*\/>/, "Today must render the actionable routine agenda");
assert.doesNotMatch(todayClient, /<TodaysPlan\s*\/>/, "Today must not retain the passive routine summary");

assert.doesNotMatch(todayAgenda, /<TodayDoses/, "Today must not duplicate the full Routine checklist");
assert.match(todayAgenda, /groupRoutineItems\(items\)\.current\.filter\(\(item\) => !item\.schedule\)/, "Today must name items with missing schedules");
assert.match(todayAgenda, /Personalized nudge/, "Today must frame routine support as a personalized nudge");
assert.match(todayAgenda, /Your daily rhythm/, "Today must present lightweight routine momentum");
assert.match(todayAgenda, /nextUpcomingOccurrence\(occurrences, currentMinutes\)/, "Today must select one next useful action");
assert.match(todayAgenda, /coachMessage\(completed, occurrences\.length\)/, "Today must adapt coaching language to progress");
assert.match(todayAgenda, /Mark taken/, "Today must make the next action immediately recordable");
assert.match(todayAgenda, /Open full Routine/, "Detailed routine work must remain in Routine");

assert.match(doseChecklist, /recordGroup\(label, occurrences\)/, "Daypart batch completion must remain available");
assert.match(doseChecklist, /void record\(occurrence, "taken"\)/, "Taken action must remain available");
assert.match(doseChecklist, /void record\(occurrence, "skipped"\)/, "Skipped action must remain available");
assert.match(doseChecklist, /void undo\(occurrence\.eventId\)/, "Undo must remain available");
assert.match(doseChecklist, /day\.asNeeded\.length/, "As-needed items must remain available in Routine");

assert.match(routineClient, /#edit-routine-item-/, "Routine must recognize item-specific edit links");
assert.match(routineClient, /setEditing\(item\)/, "Item-specific edit links must open the editor");

console.log("PR97 unified daily agenda assertions passed.");
