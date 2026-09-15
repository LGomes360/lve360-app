import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const cron = read("app/api/cron/reminders/route.ts");
const webhook = read("app/api/webhooks/resend/route.ts");
const workflow = read(".github/workflows/reminders.yml");
const env = read("src/lib/env.ts");
const envCheck = read("scripts/check-env.mjs");
const runbook = read("docs/reminder-delivery-operations.md");
const releaseGate = read("scripts/release-gate.mjs");

assert.match(cron, /buildReminderDispatchOutcome/);
assert.match(cron, /ledger_persist_failed_after_acceptance/);
assert.match(cron, /delivery_state_unresolved/);
assert.match(cron, /retryDatabaseOperation\("profile_lookup"/);
assert.doesNotMatch(cron, /dispatchError\s*}/, "Logs must not serialize raw member dispatch errors.");
assert.match(webhook, /invalid_signature[\s\S]*status: 400/);
assert.match(webhook, /ledger_update_failed[\s\S]*status: 503/);
assert.match(webhook, /applyReminderProviderEvent/);
assert.match(webhook, /update\.deliveryId/);
assert.match(cron, /provider_event_at", null/);
assert.match(workflow, /actions\/checkout@v4/);
assert.match(workflow, /node scripts\/run-reminder-dispatch\.mjs/);
assert.doesNotMatch(workflow, /jq|curl/);
assert.match(env, /RESEND_WEBHOOK_SECRET/);
assert.match(envCheck, /RESEND_WEBHOOK_SECRET/);
assert.match(runbook, /email\.delivered/);
assert.match(runbook, /Replayed delivery events/);
assert.match(releaseGate, /'qa:pr180'/);

console.log("PR180 reliability architecture assertions passed.");
