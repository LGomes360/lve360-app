# PR163 private access foundation

## Purpose

Separate authorization to the private LVE360 application from Stripe billing.
The migration is additive and preserves every existing Stripe customer,
subscription, tier, Blueprint, and authenticated account.

## Compatibility behavior

- Existing `premium` and `trial` profiles are backfilled as `private_member`.
- Existing Stripe members are classified as monthly or annual from their saved
  billing interval.
- A paid/trial profile without a Stripe customer is classified as complimentary.
- Free profiles remain `blueprint_only`.
- Runtime access resolution temporarily falls back to legacy `tier` when the new
  columns are unavailable, protecting the short deploy-before-migration window.
- A temporary database bridge synchronizes legacy tier changes into the new
  fields, so purchases and cancellations remain consistent during staged rollout.
- Existing routes continue using their current paid guards in PR163. Later PRs
  will switch them to the new private-access guard after production verification
  and remove the legacy synchronization bridge.

## Security change

Authenticated browser sessions previously had `UPDATE` privilege on every
column in their own `public.users` row. PR163 removes browser insert/update
policies and privileges from this account-control table. Member-editable settings
already live in purpose-specific tables. Profile reconciliation and Stripe writes
continue through server-only service-role routes.

## Feature flags

PR163 adds server-only typed configuration. Defaults preserve the existing public
paid funnel. Invitation issuance defaults to false and additionally requires a
valid founder Auth UUID. A database approval gate will be added with the secure
invitation workflow; both gates must pass before invitations can be issued.

## Production migration verification

After the PR is merged, apply the migration before changing any product-mode
flags. Verify aggregate state without selecting emails or health information:

```sql
select access_status, billing_mode, count(*)
from public.users
group by access_status, billing_mode
order by access_status, billing_mode;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'users'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
```

Expected result: existing paid/trial members are private members, free profiles
are Blueprint-only, and authenticated has SELECT but not INSERT or UPDATE on
`public.users`.

## Rollback

Dropping the new columns restores the former schema. Restoring the old browser
UPDATE grant is intentionally a separate manual step because it would reopen
client writes to entitlement and Stripe fields. Stripe subscriptions are never
changed by this migration, so no Stripe rollback is required.
