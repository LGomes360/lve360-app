-- PR144: remove unintended Data API access to privileged helper functions.
--
-- SECURITY DEFINER functions run with their owner's privileges and bypass RLS.
-- PostgreSQL grants function execution to PUBLIC by default, so revoking only
-- anon/authenticated is not sufficient. Each function below is reset to an
-- explicit least-privilege access model.

-- Trigger functions are invoked by their registered database triggers. Client
-- roles, including service_role, do not need permission to call them as RPCs.
revoke execute on function public.enforce_lowercase_email()
  from public, anon, authenticated, service_role;
revoke execute on function public.enforce_lowercase_email_stacks()
  from public, anon, authenticated, service_role;
revoke execute on function public.enforce_lowercase_email_submissions()
  from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_auth_user()
  from public, anon, authenticated, service_role;
revoke execute on function public.set_timestamp_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.set_updated_at()
  from public, anon, authenticated, service_role;

-- Account reconciliation moves ownership across member and billing records.
-- The authenticated provisioning route verifies the member, then calls v2
-- through the server-only Supabase service-role client. Keep both versions
-- unavailable to browsers and explicitly server-only.
revoke execute on function public.reconcile_user_and_attach(text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.reconcile_user_and_attach_v2(text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.reconcile_user_and_attach(text, uuid)
  to service_role;
grant execute on function public.reconcile_user_and_attach_v2(text, uuid)
  to service_role;

-- This member-facing read already scopes results to auth.uid(). Run it with
-- the caller's privileges so table grants and RLS remain authoritative.
alter function public.get_latest_stack_items() security invoker;
revoke execute on function public.get_latest_stack_items()
  from public, anon, authenticated, service_role;
grant execute on function public.get_latest_stack_items()
  to authenticated, service_role;

-- Rollback notes:
-- 1. Restore SECURITY DEFINER on get_latest_stack_items() only if its previous
--    RLS-bypassing behavior is deliberately required.
-- 2. Restore the prior grants to PUBLIC/anon/authenticated only as an emergency
--    compatibility measure. Doing so reopens the Advisor findings and the
--    account-reassignment risk, so prefer rolling forward with a narrower fix.
