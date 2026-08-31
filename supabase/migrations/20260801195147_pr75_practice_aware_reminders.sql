alter table public.weekly_experiments
  add column if not exists reminder_timing text not null default 'account_default',
  add column if not exists reminder_hour smallint;

alter table public.weekly_experiments
  add constraint weekly_experiments_reminder_timing check (
    reminder_timing in ('account_default', 'prepare_before', 'at_cue', 'next_day')
  ),
  add constraint weekly_experiments_reminder_hour check (
    reminder_hour is null or reminder_hour between 0 and 23
  );

comment on column public.weekly_experiments.reminder_timing is
  'Member-selected reminder intent for this practice. account_default retains the account-level cue.';
comment on column public.weekly_experiments.reminder_hour is
  'Optional local delivery hour for this practice. The member timezone remains in user_preferences.';

alter table public.reminder_deliveries
  add column if not exists target_date date,
  add column if not exists reminder_timing text,
  add column if not exists skip_reason text,
  add column if not exists provider_event_type text,
  add column if not exists provider_event_at timestamptz;

alter table public.reminder_deliveries drop constraint if exists reminder_deliveries_kind;
alter table public.reminder_deliveries add constraint reminder_deliveries_kind check (
  reminder_kind in ('practice', 'recovery', 'next_day_checkin', 'weekly_review')
);

alter table public.reminder_deliveries drop constraint if exists reminder_deliveries_status;

update public.reminder_deliveries set status = 'accepted' where status = 'sent';

alter table public.reminder_deliveries add constraint reminder_deliveries_status check (
  status in ('queued', 'accepted', 'delivered', 'bounced', 'failed', 'skipped')
);

alter table public.reminder_deliveries add constraint reminder_deliveries_timing check (
  reminder_timing is null
  or reminder_timing in ('account_default', 'prepare_before', 'at_cue', 'next_day')
);

create index if not exists reminder_deliveries_provider_idx
  on public.reminder_deliveries (provider_id)
  where provider_id is not null;

create or replace function public.complete_weekly_review(
  p_user_id uuid,
  p_experiment_id uuid,
  p_difficulty smallint,
  p_value_rating smallint,
  p_decision text,
  p_action_label text default null,
  p_cue text default null,
  p_frequency_per_week smallint default null,
  p_minimum_version text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_experiment public.weekly_experiments%rowtype;
  next_id uuid;
  completed_reps smallint;
  next_week_start date;
begin
  if p_difficulty not between 1 and 5
    or p_value_rating not between 1 and 5
    or p_decision not in ('keep', 'shrink', 'swap', 'pause', 'advance') then
    raise exception 'invalid_review';
  end if;

  select * into current_experiment
  from public.weekly_experiments
  where id = p_experiment_id and user_id = p_user_id and status = 'active'
  for update;

  if not found then raise exception 'active_experiment_not_found'; end if;
  if current_date < current_experiment.week_start + 6 then raise exception 'review_not_due'; end if;
  if exists (
    select 1 from public.weekly_experiment_reviews
    where experiment_id = p_experiment_id and status = 'completed'
  ) then raise exception 'review_already_completed'; end if;

  select count(distinct completion_date)::smallint into completed_reps
  from public.daily_practice_completions
  where user_id = p_user_id
    and experiment_id = p_experiment_id
    and completion_date between current_experiment.week_start and current_experiment.week_start + 6;

  update public.weekly_experiments
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_experiment_id;

  if p_decision <> 'pause' then
    if p_action_label is null or char_length(btrim(p_action_label)) not between 4 and 240
      or p_cue is null or char_length(btrim(p_cue)) not between 2 and 160
      or p_frequency_per_week not between 1 and 7
      or p_minimum_version is null or char_length(btrim(p_minimum_version)) not between 2 and 160 then
      raise exception 'invalid_next_experiment';
    end if;

    next_week_start := greatest(
      current_experiment.week_start + 7,
      date_trunc('week', current_date)::date
    );

    insert into public.weekly_experiments (
      user_id, identity_direction, action_label, cue, frequency_per_week,
      minimum_version, reminder_preference, reminder_timing, reminder_hour,
      onboarding_step, status, week_start, activated_at
    ) values (
      p_user_id, current_experiment.identity_direction, btrim(p_action_label), btrim(p_cue),
      p_frequency_per_week, btrim(p_minimum_version), current_experiment.reminder_preference,
      current_experiment.reminder_timing, current_experiment.reminder_hour,
      6, 'active', next_week_start, now()
    ) returning id into next_id;
  end if;

  insert into public.weekly_experiment_reviews (
    user_id, experiment_id, completion_count, target_count, difficulty,
    value_rating, decision, status, next_experiment_id, completed_at, updated_at
  ) values (
    p_user_id, p_experiment_id, completed_reps, current_experiment.frequency_per_week,
    p_difficulty, p_value_rating, p_decision, 'completed', next_id, now(), now()
  ) on conflict (experiment_id) do update set
    completion_count = excluded.completion_count,
    target_count = excluded.target_count,
    difficulty = excluded.difficulty,
    value_rating = excluded.value_rating,
    decision = excluded.decision,
    status = 'completed',
    next_experiment_id = excluded.next_experiment_id,
    completed_at = excluded.completed_at,
    updated_at = excluded.updated_at;

  return next_id;
end;
$$;

comment on table public.reminder_deliveries is
  'Privacy-minimized reminder ledger for one-time claims, skip reasons, and provider delivery outcomes. Email content is not stored.';

-- Rollback: remove the PR75 reminder columns and restore the prior delivery
-- constraints and complete_weekly_review definition.
