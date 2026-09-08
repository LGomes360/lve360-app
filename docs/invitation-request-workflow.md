# Invitation request workflow (PR165)

PR165 adds a deliberately small request-and-review queue for private LVE360 membership. It does not admit users, create auth accounts, send invitations, or alter billing.

## Public submission

- `POST /api/access-requests` accepts a short, non-clinical request.
- Email is normalized and unique. Repeated submissions receive the same `202` response and do not reveal whether an email already exists.
- A quiet honeypot reduces basic bot submissions.
- The route never returns a request ID or queue status.
- The form explicitly asks people not to submit diagnoses, medication details, lab results, or other private health information.

## Founder review

- `/settings/access-requests` is available only to the configured founder user.
- Founder review can mark a request pending, waitlisted, or declined and save private notes.
- Approval is visibly disabled. PR166 owns single-use invitation issuance, acceptance, and the final founder GO gate.

## Data access

- `public.access_requests` has RLS enabled and forced with no client policies.
- `PUBLIC`, `anon`, and `authenticated` have no table privileges.
- Only `service_role` receives `select`, `insert`, and `update`; the public and founder routes enforce their separate application-level boundaries.
- Detailed health data is intentionally out of scope.

## Operations

1. Apply the migration through the normal Supabase migration workflow after merge.
2. Confirm `SUPABASE_SERVICE_ROLE_KEY` is configured for the deployment environments.
3. Verify one new request, one duplicate request, and founder-only triage.
4. Do not enable external private membership until PR166 is merged, verified, and the founder explicitly says GO.

Rollback is safe only before real requests are collected: drop `public.access_requests`. Once data exists, export or preserve it before any rollback.
