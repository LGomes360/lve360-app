alter table public.weekly_experiments
  add column connection_type text not null default 'independent',
  add column goal_id uuid references public.goals(id) on delete set null,
  add column goal_key text,
  add column goal_label_snapshot text;

update public.weekly_experiments
set
  connection_type = case
    when source_stack_id is not null and source_action_id is not null then 'blueprint'
    else 'independent'
  end,
  source_stack_id = case when source_stack_id is not null and source_action_id is not null then source_stack_id else null end,
  source_action_id = case when source_stack_id is not null and source_action_id is not null then source_action_id else null end;

alter table public.weekly_experiments
  add constraint weekly_experiments_connection_type_check
    check (connection_type in ('independent', 'goal', 'blueprint', 'both')),
  add constraint weekly_experiments_goal_connection_check
    check (
      (connection_type in ('goal', 'both') and goal_key is not null and goal_label_snapshot is not null)
      or (connection_type in ('independent', 'blueprint') and goal_id is null and goal_key is null and goal_label_snapshot is null)
    ),
  add constraint weekly_experiments_blueprint_connection_check
    check (
      (connection_type in ('blueprint', 'both') and source_stack_id is not null and source_action_id is not null)
      or (connection_type in ('independent', 'goal') and source_stack_id is null and source_action_id is null)
    ),
  add constraint weekly_experiments_goal_key_length check (goal_key is null or char_length(goal_key) between 1 and 120),
  add constraint weekly_experiments_goal_label_length check (goal_label_snapshot is null or char_length(goal_label_snapshot) between 1 and 160);

create index weekly_experiments_goal_id_idx
  on public.weekly_experiments(goal_id)
  where goal_id is not null;

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
  preserves_practice boolean;
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

    next_week_start := greatest(current_experiment.week_start + 7, date_trunc('week', current_date)::date);
    preserves_practice := p_decision in ('keep', 'shrink', 'advance');

    insert into public.weekly_experiments (
      user_id, source_stack_id, source_action_id,
      connection_type, goal_id, goal_key, goal_label_snapshot,
      identity_direction, action_label, cue, frequency_per_week, minimum_version,
      reminder_preference, reminder_timing, reminder_hour,
      onboarding_step, status, week_start, activated_at
    ) values (
      p_user_id,
      case when preserves_practice then current_experiment.source_stack_id else null end,
      case when preserves_practice then current_experiment.source_action_id else null end,
      case when preserves_practice then current_experiment.connection_type else 'independent' end,
      case when preserves_practice then current_experiment.goal_id else null end,
      case when preserves_practice then current_experiment.goal_key else null end,
      case when preserves_practice then current_experiment.goal_label_snapshot else null end,
      current_experiment.identity_direction,
      btrim(p_action_label), btrim(p_cue), p_frequency_per_week, btrim(p_minimum_version),
      current_experiment.reminder_preference, current_experiment.reminder_timing,
      current_experiment.reminder_hour, 6, 'active', next_week_start, now()
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

revoke all on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text)
  from public, anon, authenticated;
grant execute on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text)
  to service_role;

comment on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text) is
  'Completes a weekly review and preserves explicit goal and Blueprint connections only when the member keeps, shrinks, or advances the same practice.';

-- Rollback: restore the complete_weekly_review definition from
-- 20260801233949_preserve_blueprint_journey_rollover.sql, then drop
-- weekly_experiments_goal_id_idx, the five PR113 constraints, and the four
-- PR113 columns. Rolling back removes explicit practice-connection history.
