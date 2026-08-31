alter table public.stacks
  add column if not exists input_snapshot_hash text,
  add column if not exists generation_reason text,
  add column if not exists supersedes_stack_id uuid;

alter table public.stacks
  drop constraint if exists stacks_supersedes_stack_id_fkey;

alter table public.stacks
  add constraint stacks_supersedes_stack_id_fkey
  foreign key (supersedes_stack_id)
  references public.stacks(id)
  on delete set null;

alter table public.stacks
  drop constraint if exists stacks_input_snapshot_hash_length,
  drop constraint if exists stacks_generation_reason_length;

alter table public.stacks
  add constraint stacks_input_snapshot_hash_length
    check (input_snapshot_hash is null or char_length(input_snapshot_hash) = 64),
  add constraint stacks_generation_reason_length
    check (generation_reason is null or char_length(generation_reason) between 1 and 40);

drop index if exists public.stacks_submission_id_key;

create unique index if not exists stacks_submission_snapshot_key
  on public.stacks (submission_id, input_snapshot_hash)
  where input_snapshot_hash is not null;

create index if not exists stacks_submission_created_idx
  on public.stacks (submission_id, created_at desc);

create index if not exists stacks_supersedes_idx
  on public.stacks (supersedes_stack_id)
  where supersedes_stack_id is not null;

alter table public.product_events drop constraint if exists product_events_name;
alter table public.product_events add constraint product_events_name check (event_name in (
  'homepage_viewed', 'pricing_viewed', 'intake_started', 'intake_page_viewed',
  'intake_completed', 'blueprint_viewed', 'blueprint_action_selected',
  'blueprint_version_selected', 'blueprint_input_change_started',
  'blueprint_input_change_saved', 'blueprint_refresh_started',
  'blueprint_refresh_completed', 'blueprint_refresh_failed',
  'blueprint_pdf_opened',
  'checkout_started', 'checkout_completed', 'activation_started',
  'activation_completed', 'practice_completed', 'check_in_completed',
  'weekly_review_opened', 'weekly_review_completed', 'reminder_sent',
  'reminder_failed', 'reminder_opted_out', 'subscription_cancelled'
));

alter table public.product_events drop constraint if exists product_events_source;
alter table public.product_events add constraint product_events_source check (source in (
  'homepage', 'pricing', 'tally', 'results', 'blueprints', 'upgrade', 'stripe',
  'onboarding', 'today', 'daily_log', 'weekly_review', 'reminders', 'settings'
));

comment on column public.stacks.input_snapshot_hash is
  'SHA-256 of the normalized member input used to generate this immutable Blueprint version.';
comment on column public.stacks.generation_reason is
  'Privacy-safe reason for generation, such as initial or member-refresh.';
comment on column public.stacks.supersedes_stack_id is
  'Previous Blueprint version replaced by this version. Prior rows remain readable.';

-- Rollback notes:
-- 1. Keep historical stack rows or choose one row per submission before restoring
--    the legacy unique submission index.
-- 2. Drop the three indexes above, the supersedes foreign key, and the three
--    columns only after the application no longer reads version metadata.
-- 3. Restore product_events constraints to the preceding migration definitions.
