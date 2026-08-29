# PR144 privileged-function lockdown

## Purpose

Supabase Advisor reported nine `SECURITY DEFINER` functions that anonymous and
signed-in clients could execute through the generated RPC API. These functions
run with their owner's database privileges and can bypass Row Level Security.

The highest-risk functions reconcile legacy and authenticated accounts. They
can move health, Blueprint, regimen, and billing ownership between user IDs, so
only the verified server-side provisioning route may call them.

## Access model after migration

| Function group | Direct access after PR144 |
| --- | --- |
| Account reconciliation v1 and v2 | `service_role` only |
| Email and timestamp trigger helpers | No Data API role |
| Latest stack item reader | `authenticated` and `service_role`, using `SECURITY INVOKER` and existing RLS |

Database triggers continue to invoke their trigger functions without granting
those functions as public RPC endpoints. The authenticated provisioning route
continues to use `supabaseAdmin`, which is guarded by the `server-only` package
and initialized with `SUPABASE_SERVICE_ROLE_KEY`.

## Deployment verification

After applying the migration:

1. Confirm `anon` and `authenticated` cannot execute either reconciliation RPC.
2. Confirm `service_role` can execute `reconcile_user_and_attach_v2`.
3. Create or provision a verified test member and confirm the public user row is
   attached to the authenticated UUID.
4. Confirm an authenticated member can still load their latest stack items and
   cannot load another member's stack.
5. Rerun the Supabase Security Advisor. The 0028 and 0029 findings for these
   nine functions should be gone.

## Rollback

The migration is privilege-only and does not alter member data. If an unexpected
compatibility problem appears, roll forward by granting only the affected
function to the minimum required role. Restoring `PUBLIC`, `anon`, or broad
`authenticated` execution on either reconciliation function is not an acceptable
long-term rollback because it reopens the account-reassignment vulnerability.
