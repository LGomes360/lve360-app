import assert from "node:assert/strict";
import fs from "node:fs";

const reminders = fs.readFileSync("src/lib/reminders.ts", "utf8");
const cron = fs.readFileSync("app/api/cron/reminders/route.ts", "utf8");
const settings = fs.readFileSync("app/(app)/settings/page.tsx", "utf8");
const onboarding = fs.readFileSync("app/onboarding/OnboardingHandoffClient.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260726222150_reminder_recovery_loop.sql", "utf8");
const workflow = fs.readFileSync(".github/workflows/reminders.yml", "utf8");

assert.match(cron, /authorization.*Bearer/si, "Cron route must require CRON_SECRET authorization");
assert.match(cron, /reminderIdempotencyKey/, "Cron route must deduplicate reminder sends");
assert.match(cron, /weekly_review/, "Cron route must support the exact review path");
assert.match(reminders, /Missing a day is information, not failure/, "Recovery language must be nonjudgmental");
assert.match(reminders, /isQuietHour/, "Dispatcher must respect quiet hours");
assert.match(reminders, /weekly_review[\s\S]*:due/, "A weekly review cue must only send once per experiment");
assert.match(settings, /My timezone/, "Settings must expose reminder timezone");
assert.match(settings, /No email reminders/, "Settings must retain an explicit opt-out");
assert.match(onboarding, /resolvedOptions\(\)\.timeZone/, "Opt-in must capture the member's device timezone");
assert.match(onboarding, /cue_hour/, "Opt-in must capture a local cue hour");
assert.match(migration, /enable row level security/i, "Reminder ledger must enable RLS");
assert.match(migration, /idempotency_key text not null unique/i, "Reminder ledger must prevent duplicates");
assert.match(workflow, /cron: "5 \* \* \* \*"/, "Reminder workflow must run hourly");
assert.match(workflow, /secrets\.CRON_SECRET/, "Reminder workflow must authenticate with a repository secret");
assert.match(workflow, /https:\/\/app\.lve360\.com\/api\/cron\/reminders/, "Reminder workflow must call the canonical production host directly");
assert.match(workflow, /jq -e[\s\S]*\.ok == true/, "Reminder workflow must reject redirects and invalid dispatcher responses");

console.log("reminder assertions passed");
