import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const todayAgenda = readFileSync("src/components/dashboard/TodayRoutineAgenda.tsx", "utf8");
const doseChecklist = readFileSync("app/(app)/routine/TodayDoses.tsx", "utf8");
const doseRoute = readFileSync("app/api/routine/doses/route.ts", "utf8");

assert.match(todayAgenda, /earlierUnrecordedOccurrences/, "Today must distinguish earlier unrecorded occurrences");
assert.match(todayAgenda, /nextUpcomingOccurrence/, "Today must keep the next upcoming occurrence distinct");
assert.match(todayAgenda, /earlier scheduled item/, "Today must explain earlier unrecorded items");
assert.match(todayAgenda, /do not double-dose/, "Today must preserve safe neutral guidance");
assert.doesNotMatch(todayAgenda, /remaining\.find[\s\S]*\?\? remaining\[0\]/, "Today must not wrap to an earlier unrecorded item");

assert.match(doseChecklist, /unrecordedOccurrencesAtOrBefore\(occurrences, currentMinutes\)/, "Routine bulk actions must be time-aware");
assert.match(doseChecklist, /available\.map/, "Routine bulk actions must submit only currently available occurrences");
assert.match(doseChecklist, /Nothing available yet/, "Routine must explain why a future-only bulk action is disabled");
assert.match(doseChecklist, /disabled=\{busyKey !== null \|\| available\.length === 0\}/, "Future-only bulk actions must be disabled");

assert.match(doseRoute, /select\("timezone"\)/, "The dose API must load the member's saved timezone");
assert.match(doseRoute, /requestedDate \?\? localClock\(new Date\(\), timeZone\)\.date/, "The dose API must choose today in the member's timezone");
assert.match(doseRoute, /date, timeZone, occurrences/, "The dose API must return the timezone used by the client clock");

console.log("PR136 routine timing architecture assertions passed.");
