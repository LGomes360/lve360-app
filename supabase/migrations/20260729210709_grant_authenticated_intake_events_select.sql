alter table public.intake_events enable row level security;

revoke all on table public.intake_events from public, anon;
revoke insert, update, delete on table public.intake_events from authenticated;

grant select on table public.intake_events to authenticated;
grant select, insert, update, delete on table public.intake_events to service_role;

comment on table public.intake_events is
  'Owner-scoped daily supplement completion records. Authenticated members may read their own rows through RLS; writes remain server-only.';
