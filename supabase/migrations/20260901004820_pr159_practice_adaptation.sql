-- PR159: Make weekly Practice adaptation explicit and attributable.
--
-- Historical review decisions remain unchanged. New reviews preserve the
-- member-facing adaptation choice and one short rationale while the legacy
-- decision column continues to support existing analytics and AI history.

alter table public.weekly_experiment_reviews
  add column adaptation_kind text,
  add column adaptation_rationale text,
  add constraint weekly_experiment_reviews_adaptation_kind_check check (
    adaptation_kind is null or adaptation_kind in (
      'continue', 'decrease', 'increase', 'modify',
      'pause', 'replace', 'graduate'
    )
  ),
  add constraint weekly_experiment_reviews_adaptation_rationale_check check (
    (adaptation_kind is null and adaptation_rationale is null)
    or (
      adaptation_kind is not null
      and adaptation_rationale is not null
      and char_length(btrim(adaptation_rationale)) between 3 and 500
    )
  );

comment on column public.weekly_experiment_reviews.adaptation_kind is
  'The member-confirmed Practice transition. Null identifies a historical review created before PR159.';
comment on column public.weekly_experiment_reviews.adaptation_rationale is
  'The member-provided reason for the confirmed Practice transition.';

alter table public.plan_change_events
  drop constraint plan_change_events_change_type_check,
  add constraint plan_change_events_change_type_check check (
    change_type in (
      'added', 'updated', 'stopped', 'resumed', 'started', 'paused', 'replaced',
      'continue', 'decrease', 'increase', 'modify', 'pause', 'replace', 'graduate'
    )
  );

-- complete_weekly_review writes one richer Practice event. Suppress the older
-- row-level trigger for only that transaction so the ledger never shows a
-- duplicate generic update beside the attributable adaptation.
create or replace function public.record_practice_plan_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  event_type text;
  event_source text;
  event_summary text;
  previous_state jsonb;
  current_state jsonb;
  identity_only_change boolean := false;
begin
  if current_setting('lve360.practice_adaptation_source', true) = 'complete_weekly_review' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.identity_direction is not distinct from new.identity_direction
    and old.action_label is not distinct from new.action_label
    and old.cue is not distinct from new.cue
    and old.frequency_per_week is not distinct from new.frequency_per_week
    and old.target_quantity is not distinct from new.target_quantity
    and old.quantity_unit is not distinct from new.quantity_unit
    and old.minimum_version is not distinct from new.minimum_version
    and old.minimum_quantity is not distinct from new.minimum_quantity
    and old.minimum_quantity_unit is not distinct from new.minimum_quantity_unit
    and old.reminder_preference is not distinct from new.reminder_preference
    and old.reminder_timing is not distinct from new.reminder_timing
    and old.reminder_hour is not distinct from new.reminder_hour
    and old.connection_type is not distinct from new.connection_type
    and old.source_stack_id is not distinct from new.source_stack_id
    and old.source_action_id is not distinct from new.source_action_id
    and old.goal_id is not distinct from new.goal_id
    and old.goal_key is not distinct from new.goal_key
    and old.goal_label_snapshot is not distinct from new.goal_label_snapshot
    and old.status is not distinct from new.status then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    identity_only_change := old.identity_direction is distinct from new.identity_direction
      and old.action_label is not distinct from new.action_label
      and old.cue is not distinct from new.cue
      and old.frequency_per_week is not distinct from new.frequency_per_week
      and old.target_quantity is not distinct from new.target_quantity
      and old.quantity_unit is not distinct from new.quantity_unit
      and old.minimum_version is not distinct from new.minimum_version
      and old.minimum_quantity is not distinct from new.minimum_quantity
      and old.minimum_quantity_unit is not distinct from new.minimum_quantity_unit
      and old.reminder_preference is not distinct from new.reminder_preference
      and old.reminder_timing is not distinct from new.reminder_timing
      and old.reminder_hour is not distinct from new.reminder_hour
      and old.connection_type is not distinct from new.connection_type
      and old.source_stack_id is not distinct from new.source_stack_id
      and old.source_action_id is not distinct from new.source_action_id
      and old.goal_id is not distinct from new.goal_id
      and old.goal_key is not distinct from new.goal_key
      and old.goal_label_snapshot is not distinct from new.goal_label_snapshot
      and old.status is not distinct from new.status;
  end if;

  previous_state := case when tg_op = 'UPDATE' then jsonb_build_object(
    'identity_direction', old.identity_direction,
    'action_label', old.action_label,
    'cue', old.cue,
    'frequency_per_week', old.frequency_per_week,
    'target_quantity', old.target_quantity,
    'quantity_unit', old.quantity_unit,
    'minimum_version', old.minimum_version,
    'minimum_quantity', old.minimum_quantity,
    'minimum_quantity_unit', old.minimum_quantity_unit,
    'reminder_preference', old.reminder_preference,
    'reminder_timing', old.reminder_timing,
    'reminder_hour', old.reminder_hour,
    'connection_type', old.connection_type,
    'source_stack_id', old.source_stack_id,
    'source_action_id', old.source_action_id,
    'goal_id', old.goal_id,
    'goal_key', old.goal_key,
    'goal_label_snapshot', old.goal_label_snapshot,
    'status', old.status
  ) else null end;

  current_state := jsonb_build_object(
    'identity_direction', new.identity_direction,
    'action_label', new.action_label,
    'cue', new.cue,
    'frequency_per_week', new.frequency_per_week,
    'target_quantity', new.target_quantity,
    'quantity_unit', new.quantity_unit,
    'minimum_version', new.minimum_version,
    'minimum_quantity', new.minimum_quantity,
    'minimum_quantity_unit', new.minimum_quantity_unit,
    'reminder_preference', new.reminder_preference,
    'reminder_timing', new.reminder_timing,
    'reminder_hour', new.reminder_hour,
    'connection_type', new.connection_type,
    'source_stack_id', new.source_stack_id,
    'source_action_id', new.source_action_id,
    'goal_id', new.goal_id,
    'goal_key', new.goal_key,
    'goal_label_snapshot', new.goal_label_snapshot,
    'status', new.status
  );

  event_type := case
    when tg_op = 'INSERT' then 'started'
    when old.status = 'active' and new.status = 'paused' then 'paused'
    when old.status = 'active' and new.status = 'archived' then 'replaced'
    when old.status in ('paused', 'archived') and new.status = 'active' then 'resumed'
    else 'updated'
  end;

  event_source := case
    when identity_only_change then 'coach'
    when tg_op = 'INSERT' and new.origin_experiment_id is not null then 'onboarding'
    else 'weekly_review'
  end;

  event_summary := case event_type
    when 'started' then 'Started ' || new.action_label
    when 'paused' then 'Paused ' || new.action_label
    when 'replaced' then 'Replaced ' || new.action_label
    when 'resumed' then 'Resumed ' || new.action_label
    else 'Updated ' || new.action_label
  end;

  insert into public.plan_change_events (
    user_id, domain, entity_type, entity_id, change_type, source,
    change_summary, before_state, after_state, source_record_type,
    source_record_id
  ) values (
    new.user_id, 'practice', 'practice', new.id, event_type, event_source,
    event_summary, previous_state, current_state,
    case when new.origin_experiment_id is not null then 'weekly_experiment' else null end,
    new.origin_experiment_id::text
  );

  return new;
end;
$$;

drop function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text, numeric, text, numeric, text);

create function public.complete_weekly_review(
  p_user_id uuid,
  p_experiment_id uuid,
  p_difficulty smallint,
  p_value_rating smallint,
  p_decision text,
  p_adaptation_kind text,
  p_adaptation_rationale text,
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
  current_practice public.practices%rowtype;
  after_practice public.practices%rowtype;
  current_practice_id uuid;
  next_practice_id uuid;
  next_id uuid;
  completed_sessions smallint;
  known_total numeric(12, 2);
  known_total_unit text;
  next_week_start date;
  preserves_practice boolean;
  before_state jsonb;
  after_state jsonb;
  event_summary text;
begin
  if p_difficulty not between 1 and 5
    or p_value_rating not between 1 and 5
    or p_decision not in ('keep', 'shrink', 'swap', 'pause', 'advance')
    or p_adaptation_kind not in (
      'continue', 'decrease', 'increase', 'modify',
      'pause', 'replace', 'graduate'
    )
    or p_adaptation_rationale is null
    or char_length(btrim(p_adaptation_rationale)) not between 3 and 500
    or (p_adaptation_kind = 'continue' and p_decision <> 'keep')
    or (p_adaptation_kind = 'decrease' and p_decision <> 'shrink')
    or (p_adaptation_kind = 'increase' and p_decision <> 'advance')
    or (p_adaptation_kind = 'modify' and p_decision <> 'keep')
    or (p_adaptation_kind = 'pause' and p_decision <> 'pause')
    or (p_adaptation_kind = 'replace' and p_decision <> 'swap')
    or (p_adaptation_kind = 'graduate' and p_decision <> 'pause') then
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
  ) then
    raise exception 'review_already_completed';
  end if;

  current_practice_id := current_experiment.practice_id;
  if current_practice_id is null then
    current_practice_id := public.activate_weekly_experiment(p_user_id, p_experiment_id);
  end if;

  select * into current_practice
  from public.practices
  where id = current_practice_id and user_id = p_user_id
  for update;
  if not found then raise exception 'active_practice_not_found'; end if;

  before_state := jsonb_build_object(
    'identity_direction', current_practice.identity_direction,
    'action_label', current_practice.action_label,
    'cue', current_practice.cue,
    'frequency_per_week', current_practice.frequency_per_week,
    'target_quantity', current_practice.target_quantity,
    'quantity_unit', current_practice.quantity_unit,
    'minimum_version', current_practice.minimum_version,
    'minimum_quantity', current_practice.minimum_quantity,
    'minimum_quantity_unit', current_practice.minimum_quantity_unit,
    'status', current_practice.status
  );

  select count(*)::smallint,
    case when count(*) > 0 and count(completed_quantity) = count(*) and count(quantity_unit) = count(*) and count(distinct lower(quantity_unit)) = 1
      then sum(completed_quantity)::numeric(12, 2) else null end,
    case when count(*) > 0 and count(completed_quantity) = count(*) and count(quantity_unit) = count(*) and count(distinct lower(quantity_unit)) = 1
      then min(quantity_unit) else null end
  into completed_sessions, known_total, known_total_unit
  from public.daily_practice_completions
  where user_id = p_user_id and experiment_id = p_experiment_id
    and completion_date between current_experiment.week_start and current_experiment.week_start + 6;

  perform set_config('lve360.practice_adaptation_source', 'complete_weekly_review', true);

  update public.weekly_experiments
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_experiment_id;

  preserves_practice := p_adaptation_kind in ('continue', 'decrease', 'increase', 'modify');

  if p_adaptation_kind = 'pause' then
    update public.practices
    set status = 'paused', paused_at = now(), archived_at = null, updated_at = now()
    where id = current_practice_id and user_id = p_user_id;
  elsif p_adaptation_kind = 'graduate' then
    update public.practices
    set status = 'archived', archived_at = now(), paused_at = null, updated_at = now()
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

    if p_adaptation_kind = 'continue' and not (
      btrim(p_action_label) = current_practice.action_label
      and btrim(p_cue) = current_practice.cue
      and p_frequency_per_week = current_practice.frequency_per_week
      and p_target_quantity is not distinct from current_practice.target_quantity
      and nullif(lower(btrim(p_quantity_unit)), '') is not distinct from nullif(lower(btrim(current_practice.quantity_unit)), '')
      and btrim(p_minimum_version) = current_practice.minimum_version
      and p_minimum_quantity is not distinct from current_practice.minimum_quantity
      and nullif(lower(btrim(p_minimum_quantity_unit)), '') is not distinct from nullif(lower(btrim(current_practice.minimum_quantity_unit)), '')
    ) then
      raise exception 'invalid_continue_plan';
    end if;

    if p_adaptation_kind = 'decrease'
      and not (
        p_frequency_per_week < current_practice.frequency_per_week
        or (
          p_target_quantity is not null
          and current_practice.target_quantity is not null
          and nullif(lower(btrim(p_quantity_unit)), '') is not distinct from nullif(lower(btrim(current_practice.quantity_unit)), '')
          and p_target_quantity < current_practice.target_quantity
        )
      ) then
      raise exception 'invalid_decrease_plan';
    end if;

    if p_adaptation_kind = 'increase'
      and not (
        p_frequency_per_week > current_practice.frequency_per_week
        or (
          p_target_quantity is not null
          and current_practice.target_quantity is not null
          and nullif(lower(btrim(p_quantity_unit)), '') is not distinct from nullif(lower(btrim(current_practice.quantity_unit)), '')
          and p_target_quantity > current_practice.target_quantity
        )
      ) then
      raise exception 'invalid_increase_plan';
    end if;

    if p_adaptation_kind = 'modify' and (
      btrim(p_action_label) = current_practice.action_label
      and btrim(p_cue) = current_practice.cue
      and p_frequency_per_week = current_practice.frequency_per_week
      and p_target_quantity is not distinct from current_practice.target_quantity
      and nullif(lower(btrim(p_quantity_unit)), '') is not distinct from nullif(lower(btrim(current_practice.quantity_unit)), '')
      and btrim(p_minimum_version) = current_practice.minimum_version
      and p_minimum_quantity is not distinct from current_practice.minimum_quantity
      and nullif(lower(btrim(p_minimum_quantity_unit)), '') is not distinct from nullif(lower(btrim(current_practice.minimum_quantity_unit)), '')
    ) then
      raise exception 'invalid_modify_plan';
    end if;

    if p_adaptation_kind = 'replace'
      and lower(btrim(p_action_label)) = lower(current_practice.action_label) then
      raise exception 'invalid_replacement_plan';
    end if;

    next_week_start := greatest(current_experiment.week_start + 7, date_trunc('week', current_date)::date);

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
    known_total_quantity_unit, difficulty, value_rating, decision,
    adaptation_kind, adaptation_rationale, status,
    next_experiment_id, completed_at, updated_at
  ) values (
    p_user_id, p_experiment_id, completed_sessions, current_experiment.frequency_per_week,
    current_experiment.target_quantity, current_experiment.quantity_unit, known_total,
    known_total_unit, p_difficulty, p_value_rating, p_decision,
    p_adaptation_kind, btrim(p_adaptation_rationale), 'completed',
    next_id, now(), now()
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
    adaptation_kind = excluded.adaptation_kind,
    adaptation_rationale = excluded.adaptation_rationale,
    status = 'completed',
    next_experiment_id = excluded.next_experiment_id,
    completed_at = excluded.completed_at,
    updated_at = excluded.updated_at;

  select * into after_practice
  from public.practices
  where id = current_practice_id and user_id = p_user_id;

  after_state := jsonb_build_object(
    'identity_direction', after_practice.identity_direction,
    'action_label', after_practice.action_label,
    'cue', after_practice.cue,
    'frequency_per_week', after_practice.frequency_per_week,
    'target_quantity', after_practice.target_quantity,
    'quantity_unit', after_practice.quantity_unit,
    'minimum_version', after_practice.minimum_version,
    'minimum_quantity', after_practice.minimum_quantity,
    'minimum_quantity_unit', after_practice.minimum_quantity_unit,
    'status', after_practice.status,
    'adaptation_kind', p_adaptation_kind,
    'adaptation_rationale', btrim(p_adaptation_rationale),
    'next_experiment_id', next_id,
    'replacement_practice_id', case when p_adaptation_kind = 'replace' then next_practice_id else null end
  );

  event_summary := case p_adaptation_kind
    when 'continue' then 'Continued ' || current_practice.action_label
    when 'decrease' then 'Decreased ' || current_practice.action_label
    when 'increase' then 'Increased ' || current_practice.action_label
    when 'modify' then 'Modified ' || current_practice.action_label
    when 'pause' then 'Paused ' || current_practice.action_label
    when 'replace' then 'Replaced ' || current_practice.action_label || ' with ' || btrim(p_action_label)
    else 'Graduated ' || current_practice.action_label || ' from active focus'
  end;
  event_summary := left(event_summary || ': ' || btrim(p_adaptation_rationale), 280);

  insert into public.plan_change_events (
    user_id, domain, entity_type, entity_id, change_type, source,
    change_summary, before_state, after_state, source_record_type,
    source_record_id
  ) values (
    p_user_id, 'practice', 'practice', current_practice_id,
    p_adaptation_kind, 'weekly_review', event_summary,
    before_state, after_state, 'weekly_experiment', p_experiment_id::text
  );

  return next_id;
end;
$$;

revoke all on function public.complete_weekly_review(
  uuid, uuid, smallint, smallint, text, text, text,
  text, text, smallint, text, numeric, text, numeric, text
) from public, anon, authenticated;
grant execute on function public.complete_weekly_review(
  uuid, uuid, smallint, smallint, text, text, text,
  text, text, smallint, text, numeric, text, numeric, text
) to service_role;

comment on function public.complete_weekly_review(
  uuid, uuid, smallint, smallint, text, text, text,
  text, text, smallint, text, numeric, text, numeric, text
) is 'Completes a weekly review and atomically records the member-confirmed Practice adaptation, rationale, lineage, and append-only change event.';

-- Rollback notes:
-- 1. Restore complete_weekly_review and record_practice_plan_change from PR154.
-- 2. Restore the prior plan_change_events_change_type_check constraint.
-- 3. Drop adaptation_kind and adaptation_rationale after preserving any PR159
--    review values that must remain available outside the database.
-- Canonical Practice rows and existing ledger events must not be deleted.
