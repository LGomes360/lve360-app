import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const client = read("app/(app)/today/TodayClient.tsx");
const action = read("src/components/dashboard/TodayExperience.tsx");
const insight = read("src/components/dashboard/AiTodayBrief.tsx");
const brief = read("src/lib/todayBrief.ts");
const data = read("src/lib/ai/todayBriefData.ts");

const todayOpen = client.indexOf("<TodayExperience");
const insightInside = client.indexOf("<AiTodayBrief", todayOpen);
const todayClose = client.indexOf("</TodayExperience>", insightInside);
assert.ok(todayOpen >= 0 && insightInside > todayOpen && todayClose > insightInside, "the insight must live inside the authoritative Today action surface");
assert.ok(todayClose < client.indexOf("<TodayRoutineAgenda"), "Routine must remain a distinct supporting agenda after the decision spine");
assert.ok(client.indexOf("<DailyIntentionCard") < todayOpen, "daily intention must still begin the active Today experience");
assert.ok(client.indexOf("<TodayRoutineAgenda") < client.indexOf("<DailyLog"), "Routine and check-in order must remain intact");
assert.match(client, /key=\{`\$\{checkinDate \?\? "today"\}-\$\{briefVersion\}`\}/, "the observed fact must reload after a saved completion changes Today context");

assert.match(action, /Your best next step/);
assert.match(action, /Highest-value action today/);
assert.match(action, /Why this matters for you/);
assert.match(action, /Minimum version if today gets hard/);
assert.match(action, /Saved direction:/, "identity language must be visibly tied to a saved record");
assert.match(action, /blueprintNotice\?\.tone !== "urgent"/, "an unresolved safety failure must suppress the competing lifestyle decision");

assert.match(insight, /What LVE360 noticed/);
assert.match(insight, /Why this matters today/);
assert.match(insight, /Decision confidence and source/);
assert.match(insight, /Confidence:/);
assert.match(insight, /Source:/);
assert.doesNotMatch(insight, /Mark complete|I did it today|I did the minimum version/, "the evidence layer must not duplicate completion controls");

assert.match(brief, /today-brief-v6/);
assert.match(brief, /noticed: fallback\.noticed/, "observed facts must remain deterministic even when AI supplies supporting language");
assert.match(data, /Do not restate the explicit practice connection/, "AI rationale must not repeat the separate personal reason");

console.log("PR128 Today decision-spine architecture assertions passed.");
