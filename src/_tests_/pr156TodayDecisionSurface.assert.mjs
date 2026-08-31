import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [client, intention, checkIn, decision, insight, routine] = await Promise.all([
  readFile("app/(app)/today/TodayClient.tsx", "utf8"),
  readFile("src/components/dashboard/DailyIntentionCard.tsx", "utf8"),
  readFile("src/components/dashboard/DailyLog.tsx", "utf8"),
  readFile("src/components/dashboard/TodayExperience.tsx", "utf8"),
  readFile("src/components/dashboard/AiTodayBrief.tsx", "utf8"),
  readFile("src/components/dashboard/TodayRoutineAgenda.tsx", "utf8"),
]);

assert.match(client, /One clear priority for today/, "Today must state its single daily job.");
assert.match(client, /<DailyIntentionCard date=\{checkinDate\} compact \/>/, "The optional intention must not dominate the page.");

const intentionIndex = client.indexOf("<DailyIntentionCard");
const checkInIndex = client.indexOf('<section id="daily-log"');
const decisionIndex = client.indexOf("<TodayExperience");
const reminderIndex = client.indexOf("<ReminderArrivalFeedback");
const routineIndex = client.indexOf("<TodayRoutineAgenda");

assert.ok(intentionIndex >= 0 && checkInIndex > intentionIndex, "The optional intention should remain available before the check-in.");
assert.ok(decisionIndex > checkInIndex, "Today must listen before presenting its priority.");
assert.ok(reminderIndex > decisionIndex, "Reminder feedback must not displace the primary decision.");
assert.ok(routineIndex > decisionIndex, "Routine support must remain secondary to the primary decision.");

assert.match(intention, /if \(compact\)/, "Daily intention must support a compact optional state.");
assert.match(intention, /<details className=/, "An unset compact intention should stay collapsed until requested.");

assert.match(checkIn, /prefilled && !editing/, "A saved check-in should collapse into a concise summary.");
assert.match(checkIn, /Edit check-in/, "Members must retain a direct way to change today's check-in.");
assert.match(checkIn, /Your check-in is shaping today&apos;s priority/, "The check-in summary must explain its value.");

const actionIndex = decision.indexOf("Highest-value action today");
const completionIndex = decision.indexOf("I did it today");
const insightIndex = decision.indexOf("{children}");
assert.ok(actionIndex >= 0 && completionIndex > actionIndex, "The primary completion control must follow the named action.");
assert.ok(insightIndex > completionIndex, "Supporting AI reasoning must follow the primary action control.");
assert.match(decision, /Minimum version if today gets hard:/, "The smallest useful version must stay visible without another large card.");
assert.match(decision, /View progress/, "Detailed weekly history should route to Journey.");
assert.doesNotMatch(decision, /grid-cols-7/, "Today must not duplicate Journey's seven-day history grid.");

assert.match(insight, /<details className=/, "AI reasoning and sources should be available without competing with the priority.");
assert.match(insight, /Open reasoning and sources/, "The disclosure must describe what it opens.");
assert.match(insight, /flex-col items-start gap-2/, "The reasoning disclosure must stack cleanly on narrow screens.");
assert.match(insight, /sm:flex-row sm:items-center/, "The reasoning disclosure may return to a row on wider screens.");
assert.match(insight, /group-open:inline/, "The expanded disclosure must offer a clear way to hide the reasoning.");
assert.match(insight, /Grounding for today’s recommendation/, "Evidence provenance must remain available.");

assert.match(routine, /Open full Routine/, "Today must preserve a direct path to detailed regimen work.");
assert.doesNotMatch(client, /<TodaysPlan/, "Today must not restore the passive duplicate Plan summary.");

console.log("PR156 Today v2 decision-surface assertions passed.");
