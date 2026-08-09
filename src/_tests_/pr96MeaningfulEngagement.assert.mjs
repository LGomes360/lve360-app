import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const today = readFileSync("src/components/dashboard/TodayExperience.tsx", "utf8");
const onboarding = readFileSync("app/onboarding/OnboardingHandoffClient.tsx", "utf8");

assert.match(today, /Weekly promise/);
assert.match(today, /Minimum version complete/);
assert.match(today, /You came back today/);
assert.match(today, /Returning after a gap is a consistency win/);
assert.match(today, /This week&apos;s direction/);
assert.doesNotMatch(today, /moved your identity forward/);

assert.match(onboarding, /Your weekly practice/);
assert.match(onboarding, /Your first weekly practice/);
assert.doesNotMatch(onboarding, />Your first week</);

console.log("PR96 meaningful engagement assertions passed.");
