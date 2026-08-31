alter table public.user_preferences
  add column if not exists timezone text not null default 'UTC',
  add column if not exists cue_hour smallint not null default 18,
  add column if not exists quiet_start_hour smallint not null default 21,
  add column if not exists quiet_end_hour smallint not null default 7;

alter table public.user_preferences
  add constraint user_preferences_timezone_length check (char_length(timezone) between 1 and 80),
  add constraint user_preferences_cue_hour check (cue_hour between 0 and 23),
  add constraint user_preferences_quiet_start_hour check (quiet_start_hour between 0 and 23),
  add constraint user_preferences_quiet_end_hour check (quiet_end_hour between 0 and 23);

create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  experiment_id uuid not null references public.weekly_experiments(id) on update cascade on delete cascade,
  reminder_kind text not null,
  local_date date not null,
  idempotency_key text not null unique,
  provider_id text,
  status text not null default 'queued',
  attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_deliveries_kind check (reminder_kind in ('practice', 'recovery', 'weekly_review')),
  constraint reminder_deliveries_status check (status in ('queued', 'sent', 'failed', 'skipped'))
);

create index reminder_deliveries_user_created_idx
  on public.reminder_deliveries (user_id, created_at desc);

alter table public.reminder_deliveries enable row level security;

create policy "reminder_deliveries: select own"
  on public.reminder_deliveries for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.reminder_deliveries from public, anon, authenticated;
grant select on public.reminder_deliveries to authenticated;
grant select, insert, update, delete on public.reminder_deliveries to service_role;

alter table public.product_events drop constraint if exists product_events_name;
alter table public.product_events add constraint product_events_name check (event_name in (
  'homepage_viewed', 'pricing_viewed', 'intake_started', 'intake_page_viewed',
  'intake_completed', 'blueprint_viewed', 'blueprint_action_selected',
  'checkout_started', 'checkout_completed', 'activation_started',
  'activation_completed', 'practice_completed', 'check_in_completed',
  'weekly_review_opened', 'weekly_review_completed', 'reminder_sent',
  'reminder_failed', 'reminder_opted_out', 'subscription_cancelled'
));

alter table public.product_events drop constraint if exists product_events_source;
alter table public.product_events add constraint product_events_source check (source in (
  'homepage', 'pricing', 'tally', 'results', 'upgrade', 'stripe',
  'onboarding', 'today', 'daily_log', 'weekly_review', 'reminders', 'settings'
));

comment on table public.reminder_deliveries is
  'Privacy-minimized reminder attempt ledger used for deduplication and delivery measurement. Email content is not stored.';

-- Rollback: drop reminder_deliveries, remove the four user_preferences columns,
-- and restore product_events constraints to the preceding migration definitions.
