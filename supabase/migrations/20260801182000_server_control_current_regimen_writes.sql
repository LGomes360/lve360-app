-- PR72: regimen mutations are validated by paid, owner-bound server routes.
revoke update on table public.current_regimen_items from authenticated;
grant select on table public.current_regimen_items to authenticated;
