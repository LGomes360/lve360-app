-- PR155: Make the PR154 Plan Change Ledger strictly append-only for the
-- application service role.
--
-- Supabase's production migration runner retained its default ALL grant for
-- service_role when PR154 created the public table. Authenticated members were
-- already read-only through RLS and explicit grants. This migration removes
-- the default service-role privileges and restores only the access required by
-- database triggers and account export.

revoke all on table public.plan_change_events from service_role;
grant select, insert on table public.plan_change_events to service_role;

comment on table public.plan_change_events is
  'Private append-only history of confirmed regimen and durable Practice changes. Authenticated members may read their own rows; service-role writes are insert-only.';

-- Rollback notes:
-- Regrant UPDATE and DELETE only if an audited operational requirement is
-- introduced. Restoring Supabase's default ALL grant is intentionally not the
-- rollback because it would weaken the append-only contract.
