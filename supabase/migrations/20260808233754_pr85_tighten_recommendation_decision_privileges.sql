-- Existing projects may grant new public tables to API roles by default.
-- PR85 writes only through the server-side service role, so keep client access read-only.
revoke all on table public.recommendation_decisions from anon;
revoke insert, update, delete on table public.recommendation_decisions from authenticated;
grant select on table public.recommendation_decisions to authenticated;
grant select, insert, update, delete on table public.recommendation_decisions to service_role;
