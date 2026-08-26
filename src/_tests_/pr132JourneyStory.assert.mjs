import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dashboard, route] = await Promise.all([
  readFile("src/components/journey/JourneyDashboard.tsx", "utf8"),
  readFile("app/api/journey/route.ts", "utf8"),
]);

const storyIndex = dashboard.indexOf("<WeeklyLearningStory");
const currentChapterIndex = dashboard.indexOf("<CurrentChapter");
assert.ok(storyIndex >= 0, "Journey should render the weekly learning story.");
assert.ok(currentChapterIndex > storyIndex, "The weekly learning story should lead the paid Journey experience.");

for (const label of [
  "What changed",
  "What you followed through on",
  "What LVE360 learned",
  "What appears to work",
  "One next decision",
]) {
  assert.ok(dashboard.includes(label), `Journey should include the story step: ${label}.`);
}

assert.match(dashboard, /not proof/, "The weekly story should preserve non-causal language.");
assert.match(dashboard, /SupportingDetail title="Explore your activity and weekly history"/, "Raw weekly history should be supporting detail.");
assert.match(dashboard, /SupportingDetail title="Explore check-in patterns"/, "Charts should be supporting detail.");
assert.match(dashboard, /SupportingDetail title="Read past reflections"/, "Past reflections should be supporting detail.");
assert.match(dashboard, /<details className=/, "Supporting evidence should use a progressively disclosed control.");
assert.match(route, /isTrustworthyJourneySynthesisVersion/, "Journey should continue to show only trustworthy weekly syntheses.");

console.log("PR132 weekly learning story checks passed.");
