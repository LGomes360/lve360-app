-- PR125: Separate weekly practice frequency from quantity per completion.
-- Historical frequency_per_week values remain unchanged and continue to mean
-- planned practice sessions. Quantity is null until a member records it.

alter table public.weekly_experiments
  add column target_quantity numeric(10, 2),
  add column quantity_unit text,
  add column minimum_quantity numeric(10, 2),
  add column minimum_quantity_unit text;

alter table public.weekly_experiments
  add constraint weekly_experiments_target_quantity_check
    check (target_quantity is null or target_quantity > 0 and target_quantity <= 100000),
  add constraint weekly_experiments_quantity_unit_length
    check (quantity_unit is null or char_length(btrim(quantity_unit)) between 1 and 40),
  add constraint weekly_experiments_target_quantity_pair
    check ((target_quantity is null) = (quantity_unit is null)),
  add constraint weekly_experiments_minimum_quantity_check
    check (minimum_quantity is null or minimum_quantity > 0 and minimum_quantity <= 100000),
  add constraint weekly_experiments_minimum_quantity_unit_length
    check (minimum_quantity_unit is null or char_length(btrim(minimum_quantity_unit)) between 1 and 40),
  add constraint weekly_experiments_minimum_quantity_pair
    check ((minimum_quantity is null) = (minimum_quantity_unit is null));

alter table public.daily_practice_completions
  add column completed_quantity numeric(10, 2),
  add column quantity_unit text;

alter table public.daily_practice_completions
  add constraint daily_practice_completions_quantity_check
    check (completed_quantity is null or completed_quantity > 0 and completed_quantity <= 100000),
  add constraint daily_practice_completions_quantity_unit_length
    check (quantity_unit is null or char_length(btrim(quantity_unit)) between 1 and 40),
  add constraint daily_practice_completions_quantity_pair
    check ((completed_quantity is null) = (quantity_unit is null));

alter table public.weekly_experiment_reviews
  add column target_quantity_per_session numeric(10, 2),
  add column quantity_unit text,
  add column known_total_quantity numeric(12, 2),
  add column known_total_quantity_unit text;

alter table public.weekly_experiment_reviews
  add constraint weekly_experiment_reviews_target_quantity_check
    check (target_quantity_per_session is null or target_quantity_per_session > 0 and target_quantity_per_session <= 100000),
  add constraint weekly_experiment_reviews_target_quantity_pair
    check ((target_quantity_per_session is null) = (quantity_unit is null)),
  add constraint weekly_experiment_reviews_known_total_quantity_check
    check (known_total_quantity is null or known_total_quantity > 0),
  add constraint weekly_experiment_reviews_known_total_quantity_pair
    check ((known_total_quantity is null) = (known_total_quantity_unit is null));

alter table public.ai_weekly_syntheses
  add column suggested_target_quantity numeric(10, 2),
  add column suggested_quantity_unit text,
  add column suggested_minimum_quantity numeric(10, 2),
  add column suggested_minimum_quantity_unit text;

alter table public.ai_weekly_syntheses
  add constraint ai_weekly_syntheses_target_quantity_check
    check (suggested_target_quantity is null or suggested_target_quantity > 0 and suggested_target_quantity <= 100000),
  add constraint ai_weekly_syntheses_target_quantity_pair
    check ((suggested_target_quantity is null) = (suggested_quantity_unit is null)),
  add constraint ai_weekly_syntheses_quantity_unit_length
    check (suggested_quantity_unit is null or char_length(btrim(suggested_quantity_unit)) between 1 and 40),
  add constraint ai_weekly_syntheses_minimum_quantity_check
    check (suggested_minimum_quantity is null or suggested_minimum_quantity > 0 and suggested_minimum_quantity <= 100000),
  add constraint ai_weekly_syntheses_minimum_quantity_pair
    check ((suggested_minimum_quantity is null) = (suggested_minimum_quantity_unit is null)),
  add constraint ai_weekly_syntheses_minimum_quantity_unit_length
    check (suggested_minimum_quantity_unit is null or char_length(btrim(suggested_minimum_quantity_unit)) between 1 and 40);

drop function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text);

create function public.complete_weekly_review(
  p_user_id uuid,
  p_experiment_id uuid,
  p_difficulty smallint,
  p_value_rating smallint,
  p_decision text,
  p_action_label text default null,
  p_cue text default null,
  p_frequency_per_week smallint default null,
  p_minimum_version text default null,
  p_target_quantity numeric default null,
  p_quantity_unit text default null,
  p_minimum_quantity numeric default null,
  p_minimum_quantity_unit text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_experiment public.weekly_experiments%rowtype;
  next_id uuid;
  completed_sessions smallint;
  known_total numeric(12, 2);
  known_total_unit text;
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

  select
    count(*)::smallint,
    case
      when count(*) > 0
        and count(completed_quantity) = count(*)
        and count(quantity_unit) = count(*)
        and count(distinct lower(quantity_unit)) = 1
      then sum(completed_quantity)::numeric(12, 2)
      else null
    end,
    case
      when count(*) > 0
        and count(completed_quantity) = count(*)
        and count(quantity_unit) = count(*)
        and count(distinct lower(quantity_unit)) = 1
      then min(quantity_unit)
      else null
    end
  into completed_sessions, known_total, known_total_unit
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
      or p_minimum_version is null or char_length(btrim(p_minimum_version)) not between 2 and 160
      or ((p_target_quantity is null) <> (p_quantity_unit is null))
      or p_target_quantity is not null and (p_target_quantity <= 0 or p_target_quantity > 100000)
      or p_quantity_unit is not null and char_length(btrim(p_quantity_unit)) not between 1 and 40
      or ((p_minimum_quantity is null) <> (p_minimum_quantity_unit is null))
      or p_minimum_quantity is not null and (p_minimum_quantity <= 0 or p_minimum_quantity > 100000)
      or p_minimum_quantity_unit is not null and char_length(btrim(p_minimum_quantity_unit)) not between 1 and 40 then
      raise exception 'invalid_next_experiment';
    end if;

    next_week_start := greatest(current_experiment.week_start + 7, date_trunc('week', current_date)::date);
    preserves_practice := p_decision in ('keep', 'shrink', 'advance');

    insert into public.weekly_experiments (
      user_id, source_stack_id, source_action_id,
      connection_type, goal_id, goal_key, goal_label_snapshot,
      identity_direction, action_label, cue, frequency_per_week,
      target_quantity, quantity_unit, minimum_quantity, minimum_quantity_unit,
      minimum_version, reminder_preference, reminder_timing, reminder_hour,
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
      btrim(p_action_label), btrim(p_cue), p_frequency_per_week,
      p_target_quantity, nullif(btrim(p_quantity_unit), ''),
      p_minimum_quantity, nullif(btrim(p_minimum_quantity_unit), ''),
      btrim(p_minimum_version), current_experiment.reminder_preference,
      current_experiment.reminder_timing, current_experiment.reminder_hour,
      6, 'active', next_week_start, now()
    ) returning id into next_id;
  end if;

  insert into public.weekly_experiment_reviews (
    user_id, experiment_id, completion_count, target_count,
    target_quantity_per_session, quantity_unit,
    known_total_quantity, known_total_quantity_unit,
    difficulty, value_rating, decision, status, next_experiment_id,
    completed_at, updated_at
  ) values (
    p_user_id, p_experiment_id, completed_sessions,
    current_experiment.frequency_per_week,
    current_experiment.target_quantity, current_experiment.quantity_unit,
    known_total, known_total_unit,
    p_difficulty, p_value_rating, p_decision, 'completed', next_id,
    now(), now()
  ) on conflict (experiment_id) do update set
    completion_count = excluded.completion_count,
    target_count = excluded.target_count,
    target_quantity_per_session = excluded.target_quantity_per_session,
    quantity_unit = excluded.quantity_unit,
    known_total_quantity = excluded.known_total_quantity,
    known_total_quantity_unit = excluded.known_total_quantity_unit,
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

revoke all on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text, numeric, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text, numeric, text, numeric, text)
  to service_role;

comment on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text, numeric, text, numeric, text) is
  'Completes a weekly review using session frequency and optional structured quantity without inferring volume from action text.';

comment on column public.weekly_experiments.frequency_per_week is
  'Planned practice sessions per week. This is frequency, never physical repetitions or duration.';
comment on column public.weekly_experiments.target_quantity is
  'Optional quantity intended for one full practice completion.';
comment on column public.daily_practice_completions.completed_quantity is
  'Quantity snapshot for this completion. Null means volume is unknown and must not be inferred.';

-- Rollback notes:
-- Restore complete_weekly_review from 20260816000245_pr113_practice_connections.sql.
-- Then drop the PR125 columns and constraints from ai_weekly_syntheses,
-- weekly_experiment_reviews, daily_practice_completions, and weekly_experiments.
-- Historical frequency_per_week values require no data rollback because PR125
-- preserves their original session-frequency meaning.
