# PR167 private membership release gate

PR167 closes the code-level gaps found while auditing the founder-reviewed private membership path. It does not switch Production to invitation-only mode and does not enable invitation issuance.

## Automated evidence

- `npm run qa:pr167` verifies the fail-closed product-mode controls, public request validation, durable rate limiting, founder-only review and issuance routes, exact-email invitation acceptance, append-only audit history, account export and erasure coverage, legal checks, settings privacy checks, and the 24-persona regression harness.
- `npm run typecheck` verifies the updated application contracts.
- `npm run build` verifies the complete Next.js production build.
- Supabase security and performance advisors must be reviewed after the PR167 migration is applied. RLS-with-no-policy notices for server-only invitation tables are intentional only when browser roles have no grants.

## Preview rehearsal

Apply the PR167 migration before testing the Preview request form. Keep Preview isolated from Production configuration.

1. Confirm the free Blueprint can start and its privacy links remain reachable.
2. Submit one valid request and confirm a neutral success message.
3. Submit the same email again and confirm the response does not reveal whether it already exists.
4. Submit more than five requests from one test client in one hour and confirm a `429` response with a retry window.
5. Confirm a non-founder cannot open `/settings/access-requests` or use founder review APIs.
6. As the founder, move one request through Submitted, Reviewing, Declined, and Withdrawn, then inspect its audit history.
7. With issuance disabled, confirm the issue button and API remain locked.
8. In a controlled Preview-only rehearsal, enable issuance, issue one link, and verify wrong-email, altered, expired, revoked, and replayed links grant nothing.
9. Accept one valid link with the matching verified email and confirm existing-member login still works.
10. Export the accepted test account and confirm request and invitation history appear without a token hash. Delete that test account and confirm its request, invitation, and audit rows are removed.
11. Verify desktop, mobile, and keyboard behavior on the public request and founder review pages.

## Production cutover

Production remains unchanged until every P0 rehearsal passes and Luke explicitly records GO.

At GO, set the documented invitation-only values together, redeploy once, and smoke-test the homepage, free Blueprint, request form, existing-member login, founder queue, and one controlled invitation. Public pricing, public signup, and public checkout must remain unavailable while invitation mode is active.

## Rollback

Immediately set `LVE360_INVITATION_ISSUANCE_ENABLED=false` if invitation behavior is uncertain. Restore `LVE360_ACCESS_MODE=public_paid` and the prior public flags, then redeploy. Outstanding invitation links fail closed while issuance is disabled. Preserve request and audit data; do not reverse the migration while any invitation is active.

## Founder decision

- **Current code gate:** PASS locally. Typecheck, production build, PR163 through PR167 checks, legal/privacy checks, and 24-persona regression all pass.
- **Current Production decision:** NO-GO until the migration, browser rehearsal, security advisors, and all P0 checks pass.
- **Required approval:** Luke must explicitly say GO before any Production access-mode change.
