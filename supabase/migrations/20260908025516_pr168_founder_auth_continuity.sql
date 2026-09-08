-- PR168: index the founder audit trail's actor relationship identified by the
-- Supabase performance advisor. The application auth repair is code-only.

create index if not exists access_request_events_actor_id_idx
  on public.access_request_events(actor_id);

-- Rollback: drop index if exists public.access_request_events_actor_id_idx.
