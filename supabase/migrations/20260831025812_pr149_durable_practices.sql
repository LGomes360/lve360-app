-- PR149: Introduce the durable Practice domain.
--
-- A Practice is canonical member state that can span several weekly
-- experiments. This migration intentionally does not backfill existing
-- experiments or change application write paths. PR150 owns that reconciliation
-- so the schema foundation can be reviewed and rolled back independently.

create table public.practices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  identity_direction text not null,
  action_label text not null,
  cue text not null,
  frequency_per_week smallint not null,
  target_quantity numeric(10, 2),
  quantity_unit text,
  minimum_version text not null,
  minimum_quantity numeric(10, 2),
  minimum_quantity_unit text,
  reminder_preference text not null default 'none',
  reminder_timing text not null default 'account_default',
  reminder_hour smallint,
  connection_type text not null default 'independent',
  source_stack_id uuid references public.stacks(id) on delete set null,
  source_action_id text,
  goal_id uuid references public.goals(id) on delete set null,
  goal_key text,
  goal_label_snapshot text,
  status text not null default 'active',
  activated_at timestamptz not null default now(),
  paused_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practices_identity_direction_check check (
    identity_direction in (
      'movement', 'nutrition', 'sleep', 'emotional_health',
      'relationships', 'focus', 'career', 'happiness', 'overall_health'
    )
  ),
  constraint practices_action_label_check
    check (char_length(btrim(action_label)) between 4 and 240),
  constraint practices_cue_check
    check (char_length(btrim(cue)) between 2 and 160),
  constraint practices_frequency_check
    check (frequency_per_week between 1 and 7),
  constraint practices_target_quantity_check
    check (target_quantity is null or target_quantity > 0 and target_quantity <= 100000),
  constraint practices_quantity_unit_check
    check (quantity_unit is null or char_length(btrim(quantity_unit)) between 1 and 40),
  constraint practices_target_quantity_pair_check
    check ((target_quantity is null) = (quantity_unit is null)),
  constraint practices_minimum_version_check
    check (char_length(btrim(minimum_version)) between 2 and 160),
  constraint practices_minimum_quantity_check
    check (minimum_quantity is null or minimum_quantity > 0 and minimum_quantity <= 100000),
  constraint practices_minimum_quantity_unit_check
    check (minimum_quantity_unit is null or char_length(btrim(minimum_quantity_unit)) between 1 and 40),
  constraint practices_minimum_quantity_pair_check
    check ((minimum_quantity is null) = (minimum_quantity_unit is null)),
  constraint practices_reminder_preference_check
    check (reminder_preference in ('none', 'email')),
  constraint practices_reminder_timing_check
    check (reminder_timing in ('account_default', 'prepare_before', 'at_cue', 'next_day')),
  constraint practices_reminder_hour_check
    check (reminder_hour is null or reminder_hour between 0 and 23),
  constraint practices_reminder_configuration_check
    check (
      (reminder_preference = 'none' and reminder_hour is null)
      or reminder_preference = 'email'
    ),
  constraint practices_connection_type_check
    check (connection_type in ('independent', 'goal', 'blueprint', 'both')),
  constraint practices_source_action_length_check
    check (source_action_id is null or char_length(source_action_id) <= 80),
  constraint practices_goal_connection_check
    check (
      (connection_type in ('goal', 'both') and goal_key is not null and goal_label_snapshot is not null)
      or (connection_type in ('independent', 'blueprint') and goal_id is null and goal_key is null and goal_label_snapshot is null)
    ),
  constraint practices_blueprint_connection_check
    check (
      (connection_type in ('blueprint', 'both') and source_stack_id is not null and source_action_id is not null)
      or (connection_type in ('independent', 'goal') and source_stack_id is null and source_action_id is null)
    ),
  constraint practices_goal_key_length_check
    check (goal_key is null or char_length(goal_key) between 1 and 120),
  constraint practices_goal_label_length_check
    check (goal_label_snapshot is null or char_length(goal_label_snapshot) between 1 and 160),
  constraint practices_status_check
    check (status in ('active', 'paused', 'archived')),
  constraint practices_status_timestamp_check check (
    (status = 'active' and paused_at is null and archived_at is null)
    or (status = 'paused' and paused_at is not null and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

create index practices_user_status_updated_idx
  on public.practices (user_id, status, updated_at desc);

create index practices_source_stack_id_idx
  on public.practices (source_stack_id)
  where source_stack_id is not null;

create index practices_goal_id_idx
  on public.practices (goal_id)
  where goal_id is not null;

alter table public.weekly_experiments
  add column practice_id uuid references public.practices(id) on delete set null;

create index weekly_experiments_practice_id_week_idx
  on public.weekly_experiments (practice_id, week_start desc)
  where practice_id is not null;

alter table public.practices enable row level security;

revoke all on table public.practices from public, anon, authenticated;
grant select on table public.practices to authenticated;
grant select, insert, update, delete on table public.practices to service_role;

create policy "practices: select own"
  on public.practices for select
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.practices is
  'Canonical durable lifestyle practices. A practice can own multiple weekly experiments without rewriting prior weeks.';

comment on column public.weekly_experiments.practice_id is
  'Nullable durable-practice lineage. Existing experiments are reconciled by PR150; null remains a supported compatibility state until then.';

-- Rollback notes:
-- 1. Drop weekly_experiments_practice_id_week_idx.
-- 2. Drop weekly_experiments.practice_id.
-- 3. Drop public.practices. No existing weekly experiment data is modified by
--    this migration, so rollback does not require a data restore.
