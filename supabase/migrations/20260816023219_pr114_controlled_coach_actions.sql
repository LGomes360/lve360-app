create table public.coach_action_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_turn_id uuid not null unique references public.ai_coaching_turns(id) on delete cascade,
  action_type text not null default 'weekly_practice',
  status text not null default 'proposed',
  identity_direction text not null,
  action_label text not null,
  cue text not null,
  frequency_per_week smallint not null,
  minimum_version text not null,
  rationale text not null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  applied_at timestamptz,
  applied_experiment_id uuid references public.weekly_experiments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_action_proposals_type_check check (action_type = 'weekly_practice'),
  constraint coach_action_proposals_status_check check (status in ('proposed', 'confirmed', 'cancelled', 'applied')),
  constraint coach_action_proposals_identity_check check (identity_direction in ('movement', 'nutrition', 'sleep', 'emotional_health', 'relationships', 'focus', 'career', 'happiness', 'overall_health')),
  constraint coach_action_proposals_action_length check (char_length(btrim(action_label)) between 4 and 240),
  constraint coach_action_proposals_cue_length check (char_length(btrim(cue)) between 2 and 160),
  constraint coach_action_proposals_frequency_check check (frequency_per_week between 1 and 7),
  constraint coach_action_proposals_minimum_length check (char_length(btrim(minimum_version)) between 4 and 160),
  constraint coach_action_proposals_rationale_length check (char_length(btrim(rationale)) between 4 and 300),
  constraint coach_action_proposals_state_timestamps_check check (
    (status <> 'confirmed' or confirmed_at is not null)
    and (status <> 'cancelled' or cancelled_at is not null)
    and (status <> 'applied' or (confirmed_at is not null and applied_at is not null and applied_experiment_id is not null))
  )
);

create index coach_action_proposals_user_status_idx
  on public.coach_action_proposals (user_id, status, created_at desc);

create unique index coach_action_proposals_one_confirmed_per_user
  on public.coach_action_proposals (user_id)
  where status = 'confirmed';

create table public.coach_action_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.coach_action_proposals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('proposed', 'confirmed', 'cancelled', 'applied')),
  created_at timestamptz not null default now()
);

create index coach_action_events_proposal_created_idx
  on public.coach_action_events (proposal_id, created_at);

create or replace function public.log_coach_action_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.coach_action_events (proposal_id, user_id, event_type)
    values (new.id, new.user_id, new.status);
  end if;
  return new;
end;
$$;

create trigger coach_action_proposals_status_audit
after insert or update of status on public.coach_action_proposals
for each row execute function public.log_coach_action_status();

alter table public.coach_action_proposals enable row level security;
alter table public.coach_action_events enable row level security;

create policy "coach_action_proposals: select own"
  on public.coach_action_proposals for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "coach_action_events: select own"
  on public.coach_action_events for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.coach_action_proposals from anon;
revoke insert, update, delete on table public.coach_action_proposals from authenticated;
grant select on table public.coach_action_proposals to authenticated;
grant select, insert, update, delete on table public.coach_action_proposals to service_role;

revoke all on table public.coach_action_events from anon;
revoke insert, update, delete on table public.coach_action_events from authenticated;
grant select on table public.coach_action_events to authenticated;
grant select, insert, update, delete on table public.coach_action_events to service_role;

revoke all on function public.log_coach_action_status() from public, anon, authenticated;
grant execute on function public.log_coach_action_status() to service_role;

comment on table public.coach_action_proposals is
  'Typed, member-confirmed lifestyle practice proposals from Ask LVE360. Proposals never mutate medication, hormone, supplement, reminder, or health-record data.';

comment on table public.coach_action_events is
  'Append-only status history for controlled coaching action proposals.';

-- Rollback: drop trigger coach_action_proposals_status_audit on
-- public.coach_action_proposals; drop function public.log_coach_action_status();
-- then drop public.coach_action_events and public.coach_action_proposals.
