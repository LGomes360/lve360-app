import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const logic = read("src/lib/weeklySynthesis.ts");
const decision = read("src/lib/weeklySynthesisDecision.ts");
const data = read("src/lib/ai/weeklySynthesisData.ts");
const route = read("app/api/weekly-review/synthesis/route.ts");
const review = read("src/components/review/WeeklyReviewClient.tsx");
const config = read("src/lib/ai/modelConfig.ts");

assert.match(logic, /weekly-review-synthesis-v7/);
assert.match(config, /weekly_review_synthesis:[\s\S]*weekly-review-synthesis-v7/);
assert.match(route, /weekly_experiment_reviews/);
assert.match(route, /limit\(6\)/, "History must remain bounded for speed and cost.");
assert.match(data, /prior_completed_weeks/);
assert.match(data, /same_focus_area/);
assert.match(logic, /repeated low-usefulness/i);
assert.match(decision, /return "pause"/);
assert.match(logic, /recommendedAdaptiveReviewDecision/);
assert.match(logic, /Comparable completion trend/);
assert.match(review, /Smallest next experiment/);
assert.match(review, /Future reviews will add useful context/);
assert.match(review, /Your choice always controls the next week/);

console.log("PR116 adaptive weekly synthesis architecture checks passed.");
