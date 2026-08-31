revoke all on table public.daily_practice_completions from public, anon;
revoke insert, update, delete on table public.daily_practice_completions from authenticated;

grant select on table public.daily_practice_completions to authenticated;
grant select, insert, update, delete on table public.daily_practice_completions to service_role;
