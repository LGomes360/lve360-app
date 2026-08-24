import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const onboarding = read("app/onboarding/OnboardingHandoffClient.tsx");
const review = read("src/components/review/WeeklyReviewClient.tsx");
const synthesis = read("src/lib/ai/weeklySynthesisData.ts");
const journey = read("src/components/journey/JourneyDashboard.tsx");
const migration = read("supabase/migrations/20260824012650_pr125_weekly_practice_quantity.sql");

for (const source of [onboarding, review]) {
  assert.match(source, /type="number"[^>]*inputMode="decimal"/, "Quantity fields must use decimal numeric inputs.");
  assert.match(source, /type="number"[^>]*inputMode="numeric"/, "Weekly frequency must use a numeric input and keyboard.");
  assert.doesNotMatch(source, /Reps per week/i);
}
assert.match(onboarding, /Times per week/);
assert.match(onboarding, /How many times would you like to complete this practice each week\?/);
assert.match(review, /planned times/);
assert.doesNotMatch(review, /Practice repetitions|planned reps/i);
assert.match(synthesis, /deterministic_metrics/);
assert.match(synthesis, /Do not calculate frequency, quantity, or total volume/);
assert.doesNotMatch(synthesis, /planned_repetitions|completed_repetitions/);
assert.match(journey, /planned times/);
assert.match(migration, /target_quantity numeric/);
assert.match(migration, /frequency_per_week is[\s\S]*frequency, never physical repetitions/);
assert.match(migration, /completed_quantity/);
assert.match(migration, /Historical frequency_per_week values remain unchanged/);

console.log("PR125 architecture assertions passed.");
