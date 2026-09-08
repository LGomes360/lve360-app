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
2. Request the secure sign-in email.
3. Open that email in the same browser and complete authentication.
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
