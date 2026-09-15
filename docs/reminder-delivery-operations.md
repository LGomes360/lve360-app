# Reminder delivery operations

LVE360 reminder delivery has three observable stages: the hourly GitHub scheduler, the application dispatcher, and the signed Resend delivery callback. A healthy run must complete all three without hiding partial failures.

## Required production configuration

- GitHub Actions secret `CRON_SECRET` must match Vercel Production `CRON_SECRET`.
- Vercel Production must contain server-only `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` values.
- Resend must send `email.delivered`, `email.bounced`, and `email.failed` events to `https://app.lve360.com/api/webhooks/resend`.
- Never place any of these values in source control, logs, screenshots, or client-visible variables.

Run `npm run qa:env` against a securely populated local environment before a release. A missing callback secret is reported as a recommended integration gap. The callback itself fails closed with `503 webhook_not_configured` when that secret is absent.

## Scheduler success contract

The workflow runs `scripts/run-reminder-dispatch.mjs`. It accepts exactly one JSON response and succeeds only when `ok` is `true`, all counters are non-negative integers, and `failed` is zero. Network errors and pre-dispatch load failures receive at most three bounded attempts. Invalid JSON, redirects, authentication failures, and responses that report member failures stop the workflow.

The dispatcher returns HTTP 503 when any member or ledger operation fails. A retry is safe because reminder claims and Resend requests use deterministic idempotency keys. An existing queued claim with no provider identifier can reuse that same key for up to 23 hours. Older unresolved claims fail closed instead of risking another send after Resend's idempotency window.

## Delivery callback contract

The callback verifies the Svix signature before reading or updating reminder state.

- Invalid signatures return HTTP 400 and cannot change the ledger.
- Valid events that cannot update the ledger return HTTP 503 so Resend can retry them.
- Valid events for email not tracked by the reminder ledger return HTTP 200 with `ignored: true`.
- Replayed delivery events update the same row and do not create another reminder or another email.
- Reminder emails carry only their delivery-row ID as a provider tag. This lets a signed callback bind its provider ID during a rare callback-before-finalization race without exposing member content.

## Verification

1. Confirm the scheduled GitHub workflow finishes successfully and prints one dispatcher summary.
2. Confirm the summary reports `ok: true` and `failed: 0`.
3. In Resend, confirm the accepted reminder receives one of the configured terminal events.
4. In Supabase, confirm the matching `reminder_deliveries` row contains the provider ID, terminal status, provider event type, and provider event time.
5. Review Vercel runtime logs for `database operation retry`, `delivery state unresolved`, `delivery finalization failed`, or `ledger update failed` messages. Logs contain internal IDs and error codes only, never recipient addresses or message content.

## Rollback

Revert the PR and redeploy if the scheduler runner or callback causes false failures. Keep the Resend webhook enabled and preserve the ledger rows. Do not rotate or remove secrets during a code rollback unless a secret was exposed.
