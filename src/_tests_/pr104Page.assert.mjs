import assert from "node:assert/strict";
import fs from "node:fs";

const behaviorRoute = fs.readFileSync("app/api/reminders/behavior/route.ts", "utf8");
const cron = fs.readFileSync("app/api/cron/reminders/route.ts", "utf8");
const settings = fs.readFileSync("src/components/settings/ReminderBehaviorCard.tsx", "utf8");
const arrival = fs.readFileSync("src/components/dashboard/ReminderArrivalFeedback.tsx", "utf8");
const todayPage = fs.readFileSync("app/(app)/today/page.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260812014051_pr104_behavior_aware_reminders.sql", "utf8");

assert.match(behaviorRoute, /accept_suggestion/, "Timing changes must require an explicit member action.");
assert.match(behaviorRoute, /isQuietHour/, "Accepted suggestions must be checked against quiet hours again on the server.");
assert.match(behaviorRoute, /reminder_adjustments/, "Suggestion decisions must be auditable.");
assert.match(behaviorRoute, /reminder_feedback/, "Reminder feedback must be auditable.");
assert.match(behaviorRoute, /lastDecisionAt/, "Resolved suggestions must start a fresh evidence window.");
assert.match(behaviorRoute, /function isUuid/, "Reminder feedback must reject malformed delivery identifiers.");
assert.match(cron, /MAX_EMAIL_REMINDERS_PER_LOCAL_DAY = 1/, "The dispatcher must enforce a deterministic daily cap.");
assert.match(cron, /resolved_before_send/, "The dispatcher must suppress reminders resolved during a scheduler race.");
assert.match(cron, /resolvedReview/, "The dispatcher must recheck completed weekly reviews immediately before sending.");
assert.match(cron, /reminder_delivery/, "Delivered reminder links must carry an auditable feedback reference.");
assert.match(settings, /nothing changes until you approve it/i);
assert.match(settings, /Keep my current plan/);
assert.match(arrival, /Too early/);
assert.match(arrival, /Too late/);
assert.match(arrival, /Not useful/);
assert.match(arrival, /Dismiss reminder timing question/);
assert.match(todayPage, /reminder_delivery/);
assert.match(migration, /alter table public\.reminder_feedback enable row level security/i);
assert.match(migration, /alter table public\.reminder_adjustments enable row level security/i);
assert.match(migration, /grant select on public\.reminder_feedback to authenticated/i);
assert.match(migration, /feedback_type in \('useful', 'too_early', 'too_late', 'not_useful', 'dismissed'\)/i);
assert.match(migration, /current_hour between 0 and 23\s+and/i, "Every audited adjustment must retain a valid current hour.");

console.log("PR104 page, scheduler, and audit assertions passed.");
