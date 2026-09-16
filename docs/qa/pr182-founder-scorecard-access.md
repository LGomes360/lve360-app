# PR182 Founder Learning Scorecard Access

## Purpose

Restore the aggregate learning scorecard on the founder dashboard without exposing the private `analytics` schema through the Supabase Data API.

## Root cause

The PR181 server loader queried `analytics.paid_beta_learning_scorecard` through PostgREST. Production grants the service role access to that view, but the `analytics` schema is intentionally not exposed by the Data API, so the request returned `Invalid schema: analytics`.

## Security contract

- Keep the `analytics` schema private and unexposed.
- Reuse the existing aggregate view, which contains no member health records or freeform text.
- Provide one `security invoker` RPC in the exposed `public` schema.
- Revoke inherited execution from `public`, `anon`, and `authenticated`.
- Grant execution only to `service_role`; the existing founder-only page authorization remains unchanged.

## Verification

- `npm.cmd run qa:pr182`
- `npm.cmd run qa:pr152`
- `npm.cmd run typecheck`
- `npm.cmd run build` with nonsecret build-only Supabase placeholders
- `npm.cmd run qa:env` with nonsecret build-only placeholders
- Production read-only check confirmed that the canonical analytics view exists, returns 13 aggregate metric rows, and is already selectable by `service_role`.
- Supabase security and performance advisors were captured before the migration. PR182 introduces no new table, RLS policy, or index finding.

The local Supabase migration-list command could not connect because the local Docker database was not running. Repository migration-history assertions passed, and the migration must be applied to a Supabase Preview or production environment before live UI verification.

## Rollback

```sql
drop function if exists public.founder_paid_beta_learning_scorecard();
```

Restore the PR181 loader query only if the private `analytics` schema is deliberately exposed through the Data API. That broader exposure is not recommended for this fix.
