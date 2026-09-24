-- PR185: revocable, category-scoped credentials for an iPhone Shortcuts pilot.
-- The raw credential is shown once to the member and is never stored here.
-- Rollback: revoke active credentials and remove the setup UI/routes. Remove
-- Shortcut-provider rows only with member consent, restore the original
-- apple_health-only provider checks, then drop health_shortcut_tokens.

alter table public.health_data_connections
  drop constraint if exists health_data_connections_provider_check;
alter table public.health_data_connections
  add constraint health_data_connections_provider_check
  check (provider in ('apple_health', 'apple_health_shortcuts'));

alter table public.connected_health_daily_metrics
  drop constraint if exists connected_health_daily_metrics_provider_check;
alter table public.connected_health_daily_metrics
  add constraint connected_health_daily_metrics_provider_check
  check (provider in ('apple_health', 'apple_health_shortcuts'));

create table if not exists public.health_shortcut_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  allowed_data_types text[] not null,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_shortcut_tokens_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint health_shortcut_tokens_types_check
    check (
      cardinality(allowed_data_types) between 1 and 6
      and allowed_data_types <@ array[
        'steps', 'sleep', 'resting_heart_rate', 'weight',
        'active_energy', 'exercise_time'
      ]::text[]
    ),
  constraint health_shortcut_tokens_expiry_check
    check (expires_at > created_at)
);

comment on table public.health_shortcut_tokens is
  'One revocable, short-lived Apple Health Shortcuts credential per member. Stores only a SHA-256 hash, never the raw token.';

alter table public.health_shortcut_tokens enable row level security;
revoke all on table public.health_shortcut_tokens from public, anon, authenticated;
grant all on table public.health_shortcut_tokens to service_role;
