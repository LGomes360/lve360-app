import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const activation = read("app/api/activation/route.ts");
const onboarding = read("app/onboarding/OnboardingHandoffClient.tsx");
const account = read("app/api/account/route.ts");
const settings = read("app/(app)/settings/page.tsx");
const behavior = read("app/api/reminders/behavior/route.ts");
const scheduler = read("app/api/cron/reminders/route.ts");

assert.match(activation, /reminderPlanIssue/);
assert.match(activation, /error: issue\.code/);
assert.match(onboarding, /coherentReminderHours/);
assert.match(onboarding, /Choose a time that fits this cue/);
assert.match(onboarding, /Your reminder needs review/);
assert.match(account, /default_reminder_in_quiet_hours/);
assert.match(account, /practice_reminders_reset/);
assert.match(settings, /entered quiet hours now uses your account default time/);
assert.match(behavior, /coherentCandidate/);
assert.match(behavior, /reminderPlanIssue/);
assert.match(scheduler, /countSkip\("cue_conflict"\)/);

console.log("PR127 architecture assertions passed.");
