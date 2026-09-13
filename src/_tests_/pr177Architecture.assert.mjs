import assert from "node:assert/strict";
import fs from "node:fs";

const schedule = fs.readFileSync("src/lib/reminderSchedule.ts", "utf8");
const cron = fs.readFileSync("app/api/cron/reminders/route.ts", "utf8");
const behavior = fs.readFileSync("app/api/reminders/behavior/route.ts", "utf8");
const settings = fs.readFileSync("src/components/settings/ReminderBehaviorCard.tsx", "utf8");
const onboarding = fs.readFileSync("app/onboarding/OnboardingHandoffClient.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260913200000_pr177_reminder_schedule_controls.sql", "utf8");

assert.match(schedule, /outside_schedule/, "Reminder decisions must respect selected local weekdays.");
assert.match(schedule, /skipped_by_member/, "Member skips must suppress the selected local date.");
assert.match(schedule, /pausedUntil/, "A temporary pause must be evaluated before delivery.");
assert.match(cron, /reminder_weekdays/, "The dispatcher must load explicit reminder cadence.");
assert.match(cron, /reminder_paused_until/, "The dispatcher must load temporary pauses.");
assert.match(cron, /reminder_skipped_date/, "The dispatcher must load member skips.");
assert.match(behavior, /reminder_control_events/, "Reminder control changes must be auditable.");
assert.match(behavior, /pause_until_tomorrow/, "Members must have a bounded pause action.");
assert.match(settings, /Skip today/, "Settings must expose a one-day skip.");
assert.match(settings, /Pause until tomorrow/, "Settings must expose a temporary pause.");
assert.match(settings, /Resume reminders/, "Settings must expose a clear recovery action.");
assert.match(onboarding, /Reminder days/, "Weekly setup must support a non-daily reminder cadence.");
assert.match(migration, /enable row level security/i, "Reminder control history must use RLS.");
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i, "The RLS policy must use the optimized auth lookup.");
assert.match(migration, /grant select on public\.reminder_control_events to authenticated/i, "Members receive read-only access to their reminder control history.");

console.log("PR177 reminder control architecture assertions passed.");
