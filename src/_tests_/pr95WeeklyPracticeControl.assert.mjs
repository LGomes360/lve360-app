import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const activationRoute = readFileSync("app/api/activation/route.ts", "utf8");
const onboarding = readFileSync("app/onboarding/OnboardingHandoffClient.tsx", "utf8");

assert.match(activationRoute, /quiet_start_hour, quiet_end_hour/);
assert.match(activationRoute, /experiment\.status === "active" && step === 6/);
assert.match(activationRoute, /reminder_in_quiet_hours/);
assert.doesNotMatch(activationRoute, /experiment\.status === "active" && step !== 5/);

assert.match(onboarding, /Array\.from\(\{ length: 24 \}/);
assert.match(onboarding, /filter\(\(hour\) => !isQuietHour/);
assert.match(onboarding, /Your quiet hours are \{formatHour\(quietStartHour\)\} to \{formatHour\(quietEndHour\)\}/);
assert.doesNotMatch(onboarding, /9 PM through 7 AM quiet window/);
assert.match(onboarding, /Edit weekly plan/);
assert.match(onboarding, /This week's direction/);
assert.doesNotMatch(onboarding, /This is one vote for the person you are becoming/);

console.log("PR95 weekly practice control assertions passed.");
