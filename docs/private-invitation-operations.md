# Private invitation operations (PR166)

PR166 completes the invitation path but leaves it fail-closed. Merging code and applying the migration do not open issuance; the product must be in `invite_only` mode, invitation issuance must be enabled, and a founder user ID must be configured.

## Security contract

- Invitation links use 32 random bytes encoded as a 43-character base64url token.
- Only the SHA-256 token hash is stored. The raw link is returned to the founder once and cannot be recovered later.
- Links expire after seven days and can be replaced or revoked before acceptance.
- Acceptance requires a verified Supabase session for the exact invited email.
- Database acceptance locks the invitation row and atomically marks it accepted, connects the account, and grants private access.
- Used, expired, revoked, mismatched, and malformed links fail closed.
- Anonymous and authenticated browser roles have no table or function access to invitation records.

## Founder workflow

1. Open `/settings/access-requests` as the configured founder.
2. Review the request and notes.
3. When the GO gate is open, select **Approve & issue link**.
4. Copy the URL immediately and send it to the matching email address. The URL cannot be redisplayed.
5. Revoke an active link if it was sent incorrectly. Reissuing replaces and invalidates the prior link.

## Recipient workflow

1. Open the invitation URL.
2. Use Google on the invitation page with the invited account, or request the secure sign-in email.
3. For email, open the newest link in any browser and complete authentication. Forwarding does not change the invited identity. The versioned Supabase Magic Link template sends its token hash directly to LVE360's server callback, so no browser-local verifier is required. Failed exchanges return to the invitation with recovery instructions.

## Cross-browser email authentication

After PR172 is deployed, replace the Supabase **Magic Link** email body with
`supabase/templates/magic-link.html`. The template deliberately uses
`{{ .RedirectTo }}` and `{{ .TokenHash }}` rather than `{{ .ConfirmationURL }}`.
Every application redirect already contains a `next` query parameter, so the
template appends the one-time token hash and `type=email`. The callback verifies
that hash server-side and retains the invitation token when present.

Do not apply the template before the PR172 application deployment is live.
Rollback by restoring the prior `{{ .ConfirmationURL }}` template; the callback
continues to support PKCE `code` exchanges for Google and older email links.
4. The callback consumes the invitation and grants private access only if the verified email matches.

## Founder GO checklist

Do not change production configuration until PR166 CI, migration verification, private-shell browser QA, legal/privacy links, auth callback allowlists, and a founder-controlled invitation rehearsal all pass.

At GO, set production to:

- `LVE360_ACCESS_MODE=invite_only`
- `LVE360_PUBLIC_PRICING_ENABLED=false`
- `LVE360_PUBLIC_SIGNUP_ENABLED=false`
- `LVE360_BILLING_CHECKOUT_ENABLED=false`
- `LVE360_INVITATION_ISSUANCE_ENABLED=true`
- `LVE360_FOUNDER_USER_ID=<founder auth UUID>`

Rollback the public shell by restoring `public_paid` and disabling issuance. Outstanding links then fail closed. Re-lock issuance before any database rollback; do not drop the invitation table while active links exist.
# Issuance pause versus acceptance

Setting `LVE360_INVITATION_ISSUANCE_ENABLED=false` prevents new or replacement
invitations. Existing invitations remain usable in private mode while the founder
identity is configured. Expiration, revocation, verified-email matching, and
single-use database enforcement still apply. Revoke an individual outstanding
link to cancel it; pausing issuance is not revocation.

Regression: issue a test link, pause issuance and redeploy, then verify the invited
email can accept it. Confirm wrong-email, expired, revoked, and replayed links
remain rejected. No database migration is required for this change.
