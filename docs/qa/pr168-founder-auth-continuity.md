# PR168 founder authentication continuity

PR168 repairs the founder-only invitation queue discovered during the PR167 production release rehearsal. It does not change the current product mode, enable invitation issuance, or send invitations.

## Observed defect

An authenticated premium founder could use standard member pages, but `/settings/access-requests` returned a redirect to `/login`. Production runtime logs confirmed repeated `307` responses from that route without a server error.

The founder surfaces used `@supabase/ssr`, while login, session refresh, and the working member dashboard still use `@supabase/auth-helpers-nextjs`. The two client families did not read the active Preview session consistently. The founder queue therefore treated a valid member session as signed out.

## Repair

- Use the same server-component and route-handler clients as the rest of the current application.
- Keep the compatibility helpers isolated so the application can move to `@supabase/ssr` in one deliberate follow-up instead of mixing session formats.
- Force the founder queue to render dynamically so an authentication redirect is never reused from a cached response.
- Add the index recommended for `access_request_events.actor_id`.
- Keep every founder page and API protected by verified-user and founder-ID checks.

## Verification

Run `npm run typecheck`, `npm run qa:pr168`, and `npm run build`.

In Preview, sign in as the configured founder and confirm:

1. `/settings/access-requests` loads without returning to `/login`.
2. The GO gate remains visibly locked while Production is in public-paid mode.
3. A request can move between review states and notes persist after reload.
4. A non-founder remains unable to load the page or its APIs.
5. Invitation issuance remains disabled and no invitation email is sent.

## Production migration

After merge, apply `20260908025516_pr168_founder_auth_continuity.sql` to Production Supabase. Re-run the performance advisor and confirm the actor foreign-key notice is cleared. The authentication repair deploys with the application and does not require a database change.

## Rollback

Revert the application commit to restore the prior cookie adapter and drop `public.access_request_events_actor_id_idx` only if the index itself causes a database problem. Keep invitation issuance disabled during rollback. The index contains no new member data and dropping it does not delete audit events.
