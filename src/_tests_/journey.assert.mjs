import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, route, dashboard, helpers] = await Promise.all([
  readFile("app/(app)/journey/page.tsx", "utf8"),
  readFile("app/api/journey/route.ts", "utf8"),
  readFile("src/components/journey/JourneyDashboard.tsx", "utf8"),
  readFile("src/lib/journey.ts", "utf8"),
]);

assert.match(page, /<JourneyDashboard \/>/, "Journey page should render JourneyDashboard.");
assert.match(route, /profile\?\.tier !== "premium"/, "Journey API should enforce a paid tier.");

for (const table of [
  "weekly_experiments",
  "weekly_experiment_reviews",
  "daily_practice_completions",
  "logs",
]) {
  assert.ok(route.includes(`.from("${table}")`), `Journey API should load ${table}.`);
}

assert.match(
  dashboard,
  /does not diagnose health changes or prove that one behavior caused an outcome/,
  "Journey should distinguish observation from diagnosis and causation.",
);
assert.match(dashboard, /Four weeks gives you a more useful comparison/, "Sparse history should set an honest four-week expectation.");
assert.match(dashboard, /role="img"/, "Trend charts should expose an accessible image summary.");
assert.match(dashboard, /<table className="sr-only">/, "Trend charts should include a screen-reader data table.");
assert.match(dashboard, /Complete the minimum version or finish a weekly review/, "Empty wins should guide the next action.");
assert.match(helpers, /measuredMetricsForDomain/, "Trends should be selected by the user's current domain.");

console.log("Journey v1 acceptance checks passed.");
