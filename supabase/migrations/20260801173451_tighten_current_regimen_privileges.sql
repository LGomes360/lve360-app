-- PR72: override broad project defaults with the minimum direct client access.
revoke all on table public.current_regimen_items from public, anon, authenticated;
grant select, update on table public.current_regimen_items to authenticated;
grant select, insert, update, delete on table public.current_regimen_items to service_role;

-- All inserts and deletes remain server-controlled through paid, owner-bound routes.
