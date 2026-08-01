import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const onboarding = read("app/onboarding/OnboardingHandoffClient.tsx");
const cron = read("app/api/cron/reminders/route.ts");
const reminderEmail = read("src/lib/reminders.ts");
const webhook = read("app/api/webhooks/resend/route.ts");
const routine = read("app/(app)/routine/RoutineClient.tsx");
const hormoneRoute = read("app/api/routine/hormones/route.ts");
const updateRoute = read("app/api/stacks/update/route.ts");
const today = read("src/components/dashboard/TodayExperience.tsx");
const migration = read("supabase/migrations/20260801192204_pr75_practice_aware_reminders.sql");

assert.match(onboarding, /Help me prepare beforehand/, "Members must be able to prepare before a practice.");
assert.match(onboarding, /Check in the next morning/, "Members must be able to protect phone-free bedtime practices.");
assert.match(onboarding, /Change reminder plan/, "An active practice must remain editable.");
assert.match(cron, /target_date/, "Next-day reminders must retain the practice date they refer to.");
assert.match(cron, /shouldLedgerSkip/, "Meaningful reminder skips must be observable.");
assert.match(reminderEmail, /Your practice:/, "Reminder email must name the exact practice.");
assert.match(reminderEmail, /Minimum version:/, "Reminder email must include the minimum version.");
assert.match(webhook, /new Webhook\(webhookSecret\)\.verify/, "Resend events must be signature verified.");
assert.match(webhook, /email\.delivered/, "Delivered reminder status must be observable.");
assert.match(webhook, /email\.bounced/, "Bounced reminder status must be observable.");
assert.match(today, /Phone-free check-in:/, "Next-day links must support recording the prior practice date.");
assert.match(routine, /Add a hormone/, "Routine must let members add a hormone therapy.");
assert.match(routine, /kind="hormone"/, "Hormones must use the prescribed-item workflow.");
assert.match(hormoneRoute, /normalizeHormoneRecordInput/, "New hormones must use strict provenance validation.");
assert.match(updateRoute, /existing\.item_kind === "hormone"/, "Hormone changes must be treated as prescribed instructions.");
assert.match(migration, /reminder_timing in \('account_default', 'prepare_before', 'at_cue', 'next_day'\)/, "Reminder intent must be constrained in Postgres.");
assert.match(migration, /status in \('queued', 'accepted', 'delivered', 'bounced', 'failed', 'skipped'\)/, "Reminder outcomes must be constrained and observable.");

console.log("PR75 page, reminder, and hormone assertions passed");
