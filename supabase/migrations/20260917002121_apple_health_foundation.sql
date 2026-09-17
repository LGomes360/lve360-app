-- PR183: Apple Health foundation.
-- Store only member-scoped daily aggregates. Raw HealthKit samples, workouts,
-- routes, clinical records, and Apple identifiers remain out of scope.

create table if not exists public.health_data_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'connected',
  requested_data_types text[] not null default '{}'::text[],
  last_sync_completed_at timestamptz,
  last_sync_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider),
  constraint health_data_connections_provider_check
    check (provider in ('apple_health')),
  constraint health_data_connections_status_check
    check (status in ('connected', 'paused', 'disconnected', 'error'))
);

comment on table public.health_data_connections is
  'Member-owned connection status for health data providers. Contains no provider credentials or Apple identifiers.';

create table if not exists public.connected_health_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  local_date date not null,
  time_zone text not null,
  steps integer,
  sleep_minutes integer,
  resting_heart_rate numeric(6, 2),
  weight_kg numeric(7, 3),
  active_energy_kcal numeric(9, 2),
  exercise_minutes integer,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connected_health_daily_metrics_provider_check
    check (provider in ('apple_health')),
  constraint connected_health_daily_metrics_steps_check
    check (steps is null or steps between 0 and 500000),
  constraint connected_health_daily_metrics_sleep_check
    check (sleep_minutes is null or sleep_minutes between 0 and 1440),
  constraint connected_health_daily_metrics_resting_hr_check
    check (resting_heart_rate is null or resting_heart_rate between 20 and 250),
  constraint connected_health_daily_metrics_weight_check
    check (weight_kg is null or weight_kg between 20 and 500),
  constraint connected_health_daily_metrics_active_energy_check
    check (active_energy_kcal is null or active_energy_kcal between 0 and 50000),
  constraint connected_health_daily_metrics_exercise_check
    check (exercise_minutes is null or exercise_minutes between 0 and 1440),
  constraint connected_health_daily_metrics_unique_day
    unique (user_id, provider, local_date)
);

comment on table public.connected_health_daily_metrics is
  'Daily aggregates imported with member permission. Never stores raw HealthKit samples, workout routes, or clinical records.';

create index if not exists connected_health_daily_metrics_user_date_idx
  on public.connected_health_daily_metrics (user_id, local_date desc);

alter table public.health_data_connections enable row level security;
alter table public.connected_health_daily_metrics enable row level security;

drop policy if exists "Members can view their health connections" on public.health_data_connections;
create policy "Members can view their health connections"
  on public.health_data_connections
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Members can view their connected health metrics" on public.connected_health_daily_metrics;
create policy "Members can view their connected health metrics"
  on public.connected_health_daily_metrics
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.health_data_connections from public, anon, authenticated;
revoke all on table public.connected_health_daily_metrics from public, anon, authenticated;
grant select on table public.health_data_connections to authenticated;
grant select on table public.connected_health_daily_metrics to authenticated;
grant all on table public.health_data_connections to service_role;
grant all on table public.connected_health_daily_metrics to service_role;
