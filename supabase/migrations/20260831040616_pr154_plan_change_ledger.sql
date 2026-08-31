-- PR154: Keep a private, append-only history of confirmed Plan changes.
--
-- The ledger begins with changes made after this migration. Existing regimen
-- items and Practices are canonical current state, but are intentionally not
-- backfilled as historical events.

create table public.plan_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  domain text not null,
  entity_type text not null,
  entity_id uuid not null,
  change_type text not null,
  source text not null,
  change_summary text not null,
  before_state jsonb,
  after_state jsonb,
  source_record_type text,
  source_record_id text,
  created_at timestamptz not null default now(),
  constraint plan_change_events_domain_check
    check (domain in ('regimen', 'practice')),
  constraint plan_change_events_entity_type_check
    check (char_length(btrim(entity_type)) between 1 and 80),
  constraint plan_change_events_change_type_check
    check (change_type in ('added', 'updated', 'stopped', 'resumed', 'started', 'paused', 'replaced')),
  constraint plan_change_events_source_check
    check (source in ('member', 'blueprint', 'onboarding', 'weekly_review', 'coach', 'system')),
  constraint plan_change_events_summary_check
    check (char_length(btrim(change_summary)) between 1 and 280),
  constraint plan_change_events_state_check
    check (before_state is not null or after_state is not null),
  constraint plan_change_events_before_object_check
    check (before_state is null or jsonb_typeof(before_state) = 'object'),
  constraint plan_change_events_after_object_check
    check (after_state is null or jsonb_typeof(after_state) = 'object'),
  constraint plan_change_events_source_record_type_check
    check (source_record_type is null or char_length(btrim(source_record_type)) between 1 and 80),
  constraint plan_change_events_source_record_id_check
    check (source_record_id is null or char_length(btrim(source_record_id)) between 1 and 160)
);

create index plan_change_events_user_created_idx
  on public.plan_change_events (user_id, created_at desc, id desc);

create index plan_change_events_user_domain_entity_idx
  on public.plan_change_events (user_id, domain, entity_id, created_at desc);

alter table public.plan_change_events enable row level security;

revoke all on table public.plan_change_events from public, anon, authenticated;
grant select on table public.plan_change_events to authenticated;
grant select, insert on table public.plan_change_events to service_role;

create policy "plan_change_events: select own"
  on public.plan_change_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.plan_change_events is
  'Private append-only history of confirmed regimen and durable Practice changes. Canonical current state remains in current_regimen_items and practices.';

create function public.record_regimen_plan_change()
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
begin
  -- Intake hydration establishes current state; it is not a confirmed member
  -- change and should not manufacture historical activity.
  if tg_op = 'INSERT' and new.instruction_source = 'intake' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.item_kind is not distinct from new.item_kind
    and old.name is not distinct from new.name
    and old.purpose is not distinct from new.purpose
    and old.dose is not distinct from new.dose
    and old.timing is not distinct from new.timing
    and old.schedule is not distinct from new.schedule
    and old.brand is not distinct from new.brand
    and old.reorder_url is not distinct from new.reorder_url
    and old.image_url is not distinct from new.image_url
    and old.product_source is not distinct from new.product_source
    and old.product_sku is not distinct from new.product_sku
    and old.instruction_authority is not distinct from new.instruction_authority
    and old.active is not distinct from new.active then
    return new;
  end if;

  previous_state := case when tg_op = 'UPDATE' then jsonb_build_object(
    'item_kind', old.item_kind,
    'name', old.name,
    'purpose', old.purpose,
    'dose', old.dose,
    'timing', old.timing,
    'schedule', old.schedule,
    'brand', old.brand,
    'reorder_url', old.reorder_url,
    'image_url', old.image_url,
    'product_source', old.product_source,
    'product_sku', old.product_sku,
    'instruction_source', old.instruction_source,
    'instruction_authority', old.instruction_authority,
    'active', old.active
  ) else null end;

  current_state := jsonb_build_object(
    'item_kind', new.item_kind,
    'name', new.name,
    'purpose', new.purpose,
    'dose', new.dose,
    'timing', new.timing,
    'schedule', new.schedule,
    'brand', new.brand,
    'reorder_url', new.reorder_url,
    'image_url', new.image_url,
    'product_source', new.product_source,
    'product_sku', new.product_sku,
    'instruction_source', new.instruction_source,
    'instruction_authority', new.instruction_authority,
    'active', new.active
  );

  event_type := case
    when tg_op = 'INSERT' then 'added'
    when old.active and not new.active then 'stopped'
    when not old.active and new.active then 'resumed'
    else 'updated'
  end;

  event_source := case new.instruction_source
    when 'adopted_recommendation' then 'blueprint'
    when 'member_update' then 'member'
    when 'manual_add' then 'member'
    else 'system'
  end;

  event_summary := case event_type
    when 'added' then 'Added ' || new.name
    when 'stopped' then 'Stopped ' || new.name
    when 'resumed' then 'Resumed ' || new.name
    else 'Updated ' || new.name
  end;

  insert into public.plan_change_events (
    user_id, domain, entity_type, entity_id, change_type, source,
    change_summary, before_state, after_state, source_record_type,
    source_record_id
  ) values (
    new.user_id, 'regimen', new.item_kind, new.id, event_type,
    event_source, event_summary, previous_state, current_state,
    case
      when new.source_stack_item_id is not null then 'stack_item'
      when new.source_submission_id is not null then 'submission'
      else null
    end,
    coalesce(new.source_stack_item_id::text, new.source_submission_id::text)
  );

  return new;
end;
$$;

revoke all on function public.record_regimen_plan_change()
  from public, anon, authenticated;

create trigger record_regimen_plan_change_after_write
  after insert or update on public.current_regimen_items
  for each row execute function public.record_regimen_plan_change();

create function public.record_practice_plan_change()
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

revoke all on function public.record_practice_plan_change()
  from public, anon, authenticated;

create trigger record_practice_plan_change_after_write
  after insert or update on public.practices
  for each row execute function public.record_practice_plan_change();

-- Rollback notes:
-- 1. Drop record_practice_plan_change_after_write and
--    record_regimen_plan_change_after_write.
-- 2. Drop record_practice_plan_change() and record_regimen_plan_change().
-- 3. Drop plan_change_events. Canonical regimen and Practice rows are not
--    changed by rollback, but ledger history would be removed.
