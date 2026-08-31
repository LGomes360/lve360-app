-- PR150: Reconcile activated weekly experiments into durable Practices and
-- keep future activation/review transitions atomic.

alter table public.practices
  add column origin_experiment_id uuid references public.weekly_experiments(id) on delete set null;

create unique index practices_origin_experiment_id_key
  on public.practices (origin_experiment_id)
  where origin_experiment_id is not null;

comment on column public.practices.origin_experiment_id is
  'First historical weekly experiment reconciled into this Practice. Used for auditable, idempotent lineage backfill.';

-- A preserving review edge (keep, shrink, or advance) belongs to the same
-- Practice. Swap starts a new Practice. Incomplete drafts remain unlinked until
-- the member confirms activation.
create temporary table pr150_practice_groups on commit drop as
with recursive eligible as (
  select experiments.*
  from public.weekly_experiments experiments
  where experiments.status <> 'draft'
    and experiments.identity_direction is not null
    and experiments.action_label is not null
    and experiments.cue is not null
    and experiments.frequency_per_week is not null
    and experiments.minimum_version is not null
),
preserving_edges as (
  select reviews.experiment_id, reviews.next_experiment_id
  from public.weekly_experiment_reviews reviews
  join eligible current_week on current_week.id = reviews.experiment_id
  join eligible next_week on next_week.id = reviews.next_experiment_id
  where reviews.decision in ('keep', 'shrink', 'advance')
    and reviews.next_experiment_id is not null
),
roots as (
  select experiments.id
  from eligible experiments
  where not exists (
    select 1 from preserving_edges edges where edges.next_experiment_id = experiments.id
  )
),
walk as (
  select roots.id as root_id, roots.id as experiment_id, array[roots.id] as path
  from roots
  union all
  select walk.root_id, edges.next_experiment_id, walk.path || edges.next_experiment_id
  from walk
  join preserving_edges edges on edges.experiment_id = walk.experiment_id
  where not edges.next_experiment_id = any(walk.path)
),
assigned as (
  select distinct root_id, experiment_id from walk
),
singletons as (
  select experiments.id as root_id, experiments.id as experiment_id
  from eligible experiments
  where not exists (select 1 from assigned where assigned.experiment_id = experiments.id)
)
select * from assigned
union all
select * from singletons;

with ranked as (
  select
    groups.root_id,
    experiments.*,
    reviews.decision as latest_decision,
    reviews.completed_at as review_completed_at,
    row_number() over (
      partition by groups.root_id
      order by
        case experiments.status when 'active' then 0 when 'completed' then 1 else 2 end,
        experiments.week_start desc,
        experiments.updated_at desc
    ) as position
  from pr150_practice_groups groups
  join public.weekly_experiments experiments on experiments.id = groups.experiment_id
  left join public.weekly_experiment_reviews reviews on reviews.experiment_id = experiments.id
)
insert into public.practices (
  user_id, identity_direction, action_label, cue, frequency_per_week,
  target_quantity, quantity_unit, minimum_version, minimum_quantity,
  minimum_quantity_unit, reminder_preference, reminder_timing, reminder_hour,
  connection_type, source_stack_id, source_action_id, goal_id, goal_key,
  goal_label_snapshot, status, activated_at, paused_at, archived_at,
  created_at, updated_at, origin_experiment_id
)
select
  user_id, identity_direction, btrim(action_label), btrim(cue), frequency_per_week,
  target_quantity, nullif(btrim(quantity_unit), ''), btrim(minimum_version), minimum_quantity,
  nullif(btrim(minimum_quantity_unit), ''), reminder_preference, reminder_timing,
  reminder_hour, connection_type, source_stack_id, source_action_id, goal_id,
  goal_key, goal_label_snapshot,
  case when status = 'active' then 'active'
       when latest_decision = 'pause' then 'paused'
       else 'archived' end,
  coalesce(activated_at, created_at, now()),
  case when status <> 'active' and latest_decision = 'pause'
       then coalesce(review_completed_at, completed_at, updated_at, now()) else null end,
  case when status <> 'active' and latest_decision is distinct from 'pause'
       then coalesce(completed_at, updated_at, now()) else null end,
  coalesce(created_at, now()), updated_at, root_id
from ranked
where position = 1
on conflict (origin_experiment_id) where origin_experiment_id is not null do nothing;

update public.weekly_experiments experiments
set practice_id = practices.id
from pr150_practice_groups groups
join public.practices practices on practices.origin_experiment_id = groups.root_id
where experiments.id = groups.experiment_id
  and experiments.practice_id is null;

create function public.activate_weekly_experiment(
  p_user_id uuid,
  p_experiment_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_experiment public.weekly_experiments%rowtype;
  current_practice_id uuid;
begin
  select * into current_experiment
  from public.weekly_experiments
  where id = p_experiment_id
    and user_id = p_user_id
    and status in ('draft', 'active')
  for update;

  if not found then raise exception 'experiment_not_found'; end if;
  if current_experiment.practice_id is not null and current_experiment.status = 'active' then
    return current_experiment.practice_id;
  end if;
  if current_experiment.identity_direction is null
    or current_experiment.action_label is null or char_length(btrim(current_experiment.action_label)) not between 4 and 240
    or current_experiment.cue is null or char_length(btrim(current_experiment.cue)) not between 2 and 160
    or current_experiment.frequency_per_week not between 1 and 7
    or current_experiment.minimum_version is null or char_length(btrim(current_experiment.minimum_version)) not between 2 and 160 then
    raise exception 'incomplete_experiment';
  end if;

  select id into current_practice_id
  from public.practices
  where origin_experiment_id = current_experiment.id;

  if current_practice_id is null then
    insert into public.practices (
      user_id, identity_direction, action_label, cue, frequency_per_week,
      target_quantity, quantity_unit, minimum_version, minimum_quantity,
      minimum_quantity_unit, reminder_preference, reminder_timing, reminder_hour,
      connection_type, source_stack_id, source_action_id, goal_id, goal_key,
      goal_label_snapshot, status, activated_at, origin_experiment_id
    ) values (
      current_experiment.user_id, current_experiment.identity_direction,
      btrim(current_experiment.action_label), btrim(current_experiment.cue),
      current_experiment.frequency_per_week, current_experiment.target_quantity,
      current_experiment.quantity_unit, btrim(current_experiment.minimum_version),
      current_experiment.minimum_quantity, current_experiment.minimum_quantity_unit,
      current_experiment.reminder_preference, current_experiment.reminder_timing,
      current_experiment.reminder_hour, current_experiment.connection_type,
      current_experiment.source_stack_id, current_experiment.source_action_id,
      current_experiment.goal_id, current_experiment.goal_key,
      current_experiment.goal_label_snapshot, 'active', now(), current_experiment.id
    ) returning id into current_practice_id;
  else
    update public.practices
    set status = 'active', paused_at = null, archived_at = null, updated_at = now()
    where id = current_practice_id;
  end if;

  update public.weekly_experiments
  set practice_id = current_practice_id,
      status = 'active', onboarding_step = 6,
      activated_at = coalesce(activated_at, now()), updated_at = now()
  where id = current_experiment.id;

  return current_practice_id;
end;
$$;

revoke all on function public.activate_weekly_experiment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.activate_weekly_experiment(uuid, uuid)
  to service_role;

comment on function public.activate_weekly_experiment(uuid, uuid) is
  'Atomically confirms a ready weekly experiment and creates or reuses its canonical durable Practice.';

drop function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text, numeric, text, numeric, text);

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
  current_practice_id uuid;
  next_practice_id uuid;
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
  if exists (select 1 from public.weekly_experiment_reviews where experiment_id = p_experiment_id and status = 'completed') then
    raise exception 'review_already_completed';
  end if;

  current_practice_id := current_experiment.practice_id;
  if current_practice_id is null then
    current_practice_id := public.activate_weekly_experiment(p_user_id, p_experiment_id);
  end if;

  select count(*)::smallint,
    case when count(*) > 0 and count(completed_quantity) = count(*) and count(quantity_unit) = count(*) and count(distinct lower(quantity_unit)) = 1
      then sum(completed_quantity)::numeric(12, 2) else null end,
    case when count(*) > 0 and count(completed_quantity) = count(*) and count(quantity_unit) = count(*) and count(distinct lower(quantity_unit)) = 1
      then min(quantity_unit) else null end
  into completed_sessions, known_total, known_total_unit
  from public.daily_practice_completions
  where user_id = p_user_id and experiment_id = p_experiment_id
    and completion_date between current_experiment.week_start and current_experiment.week_start + 6;

  update public.weekly_experiments
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_experiment_id;

  if p_decision = 'pause' then
    update public.practices
    set status = 'paused', paused_at = now(), archived_at = null, updated_at = now()
    where id = current_practice_id and user_id = p_user_id;
  else
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

    if preserves_practice then
      next_practice_id := current_practice_id;
      update public.practices set
        action_label = btrim(p_action_label), cue = btrim(p_cue),
        frequency_per_week = p_frequency_per_week,
        target_quantity = p_target_quantity, quantity_unit = nullif(btrim(p_quantity_unit), ''),
        minimum_version = btrim(p_minimum_version), minimum_quantity = p_minimum_quantity,
        minimum_quantity_unit = nullif(btrim(p_minimum_quantity_unit), ''),
        status = 'active', paused_at = null, archived_at = null, updated_at = now()
      where id = current_practice_id and user_id = p_user_id;
    else
      update public.practices
      set status = 'archived', archived_at = now(), paused_at = null, updated_at = now()
      where id = current_practice_id and user_id = p_user_id;
      insert into public.practices (
        user_id, identity_direction, action_label, cue, frequency_per_week,
        target_quantity, quantity_unit, minimum_version, minimum_quantity,
        minimum_quantity_unit, reminder_preference, reminder_timing, reminder_hour,
        connection_type, status, activated_at
      ) values (
        p_user_id, current_experiment.identity_direction, btrim(p_action_label), btrim(p_cue),
        p_frequency_per_week, p_target_quantity, nullif(btrim(p_quantity_unit), ''),
        btrim(p_minimum_version), p_minimum_quantity, nullif(btrim(p_minimum_quantity_unit), ''),
        current_experiment.reminder_preference, current_experiment.reminder_timing,
        current_experiment.reminder_hour, 'independent', 'active', now()
      ) returning id into next_practice_id;
    end if;

    insert into public.weekly_experiments (
      user_id, practice_id, source_stack_id, source_action_id,
      connection_type, goal_id, goal_key, goal_label_snapshot,
      identity_direction, action_label, cue, frequency_per_week,
      target_quantity, quantity_unit, minimum_quantity, minimum_quantity_unit,
      minimum_version, reminder_preference, reminder_timing, reminder_hour,
      onboarding_step, status, week_start, activated_at
    ) values (
      p_user_id, next_practice_id,
      case when preserves_practice then current_experiment.source_stack_id else null end,
      case when preserves_practice then current_experiment.source_action_id else null end,
      case when preserves_practice then current_experiment.connection_type else 'independent' end,
      case when preserves_practice then current_experiment.goal_id else null end,
      case when preserves_practice then current_experiment.goal_key else null end,
      case when preserves_practice then current_experiment.goal_label_snapshot else null end,
      current_experiment.identity_direction, btrim(p_action_label), btrim(p_cue),
      p_frequency_per_week, p_target_quantity, nullif(btrim(p_quantity_unit), ''),
      p_minimum_quantity, nullif(btrim(p_minimum_quantity_unit), ''),
      btrim(p_minimum_version), current_experiment.reminder_preference,
      current_experiment.reminder_timing, current_experiment.reminder_hour,
      6, 'active', next_week_start, now()
    ) returning id into next_id;
  end if;

  insert into public.weekly_experiment_reviews (
    user_id, experiment_id, completion_count, target_count,
    target_quantity_per_session, quantity_unit, known_total_quantity,
    known_total_quantity_unit, difficulty, value_rating, decision, status,
    next_experiment_id, completed_at, updated_at
  ) values (
    p_user_id, p_experiment_id, completed_sessions, current_experiment.frequency_per_week,
    current_experiment.target_quantity, current_experiment.quantity_unit, known_total,
    known_total_unit, p_difficulty, p_value_rating, p_decision, 'completed',
    next_id, now(), now()
  ) on conflict (experiment_id) do update set
    completion_count = excluded.completion_count, target_count = excluded.target_count,
    target_quantity_per_session = excluded.target_quantity_per_session,
    quantity_unit = excluded.quantity_unit, known_total_quantity = excluded.known_total_quantity,
    known_total_quantity_unit = excluded.known_total_quantity_unit,
    difficulty = excluded.difficulty, value_rating = excluded.value_rating,
    decision = excluded.decision, status = 'completed',
    next_experiment_id = excluded.next_experiment_id,
    completed_at = excluded.completed_at, updated_at = excluded.updated_at;

  return next_id;
end;
$$;

revoke all on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text, numeric, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text, numeric, text, numeric, text)
  to service_role;

comment on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text, numeric, text, numeric, text) is
  'Completes weekly review and atomically preserves, pauses, or replaces durable Practice lineage.';

-- Rollback notes:
-- 1. Restore complete_weekly_review from PR125 and drop activate_weekly_experiment.
-- 2. Set weekly_experiments.practice_id to null before deleting reconciled Practice rows.
-- 3. Drop practices_origin_experiment_id_key and practices.origin_experiment_id.
-- Restoring the prior function removes future atomic continuity; it does not
-- require deleting historical weekly experiment or review records.
