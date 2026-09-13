alter table public.weekly_experiments
  add column if not exists reminder_weekdays smallint[] not null default '{}'::smallint[],
  add column if not exists reminder_paused_until date,
  add column if not exists reminder_skipped_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weekly_experiments_reminder_weekdays_valid'
      and conrelid = 'public.weekly_experiments'::regclass
  ) then
    alter table public.weekly_experiments
      add constraint weekly_experiments_reminder_weekdays_valid
      check (
        cardinality(reminder_weekdays) <= 7
        and reminder_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
      );
  end if;
end $$;

create table public.reminder_control_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  experiment_id uuid not null references public.weekly_experiments(id) on update cascade on delete cascade,
  action text not null,
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint reminder_control_events_action check (
    action in ('weekdays_updated', 'skip_today', 'pause_until_tomorrow', 'resumed')
  )
);

create index reminder_control_events_user_created_idx
  on public.reminder_control_events (user_id, created_at desc);

create index reminder_control_events_experiment_created_idx
  on public.reminder_control_events (experiment_id, created_at desc);

alter table public.reminder_control_events enable row level security;

create policy "reminder_control_events: select own"
  on public.reminder_control_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.reminder_control_events from public, anon, authenticated;
grant select on public.reminder_control_events to authenticated;
grant select, insert, update, delete on public.reminder_control_events to service_role;

comment on column public.weekly_experiments.reminder_weekdays is
  'Optional local weekdays (Sunday=0) on which practice reminders may be sent. Empty means any eligible day.';
comment on column public.weekly_experiments.reminder_paused_until is
  'Local date on which reminder delivery may resume.';
comment on column public.weekly_experiments.reminder_skipped_date is
  'One local date explicitly skipped by the member.';
comment on table public.reminder_control_events is
  'Auditable member-controlled changes to weekly-practice reminder cadence and suppression.';

-- Rollback: drop public.reminder_control_events, then drop reminder_weekdays,
-- reminder_paused_until, and reminder_skipped_date from public.weekly_experiments.
