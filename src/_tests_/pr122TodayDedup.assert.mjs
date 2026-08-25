import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const client = read("app/(app)/today/TodayClient.tsx");
const focusedAction = read("src/components/dashboard/TodayExperience.tsx");
const brief = read("src/components/dashboard/AiTodayBrief.tsx");

assert.match(focusedAction, /Your best next step/, "TodayExperience must remain the authoritative action surface.");
assert.match(focusedAction, /I did it today/, "TodayExperience must retain the primary completion control.");
assert.match(focusedAction, /I did the minimum version/, "TodayExperience must retain hard-day completion.");

assert.match(brief, /Insight for today/, "The AI surface must be framed as supporting insight.");
assert.match(brief, /Why this matters/, "The AI surface must explain its observation.");
assert.doesNotMatch(brief, /Best next move/, "The AI surface must not repeat the saved practice.");
assert.doesNotMatch(brief, /If today gets hard/, "The AI surface must not repeat the minimum version.");
assert.doesNotMatch(brief, /Mark complete/, "The AI surface must not offer a second completion control.");
assert.doesNotMatch(brief, /Open Routine/, "The AI surface must not add unrelated routine navigation.");
assert.doesNotMatch(client, /onPracticeCompleted=/, "TodayClient must not coordinate completion through the AI surface.");

assert.match(brief, /primaryAction !== "mark_complete" && brief\.primaryHref/, "Exceptional review, Blueprint, and setup links must remain available.");

console.log("PR122 Today action de-duplication assertions passed.");
