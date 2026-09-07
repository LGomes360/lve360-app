# PR164 private public shell

## Purpose

PR164 adds the flag-controlled public experience for LVE360's private-membership direction while preserving the current public paid funnel until the founder chooses to change modes.

The free Blueprint remains open. The authenticated application, Stripe integration, billing records, and existing member functionality remain intact.

## Behavior by mode

### `public_paid` (current default)

- Existing homepage and pricing entry points remain available.
- Public email and Google authentication remain available.
- Stripe checkout remains available.

### `invite_only`

- The homepage presents the free Blueprint and private workspace positioning.
- Public navigation contains Blueprint, invitation, and login paths but no pricing path.
- `/pricing` and `/upgrade` redirect to `/request-invitation`.
- `/api/stripe/checkout` fails closed before loading Stripe configuration.
- Email login uses `shouldCreateUser: false`.
- Google OAuth is hidden until PR166 adds the secure invitation-aware auth hook.
- Blueprint results remain useful and replace payment CTAs with a private-access request.
- Free Blueprint result URLs no longer contain a visitor email address.

Invite-only mode clamps pricing, public signup, and checkout off even if a stale deployment variable says `true`.

## Invitation request dependency

The request page in PR164 is an honest holding surface. PR165 will add the minimal request form, protected storage, duplicate handling, and founder review. Do not enable invitation mode publicly until PR165 and PR166 are merged and verified.

Invitation issuance remains separately locked by `LVE360_INVITATION_ISSUANCE_ENABLED=false` and the founder GO requirement introduced in PR163.

## Security notes

- Product controls are resolved on the server.
- Only public-safe display flags cross into the client context.
- Administrative invitation controls and founder identifiers are never serialized to the browser.
- Hiding UI is not the checkout control; the server checkout route independently enforces the billing flag.
- Existing billing portal, webhook, confirmation, and subscription data are unchanged.

## Rollback

Keep or restore `LVE360_ACCESS_MODE=public_paid` and redeploy. No database rollback is required because PR164 has no schema changes.
