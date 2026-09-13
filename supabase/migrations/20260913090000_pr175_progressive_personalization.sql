-- PR175: member-controlled context exclusions for Ask LVE360 personalization.
create table public.ai_coach_context_preferences (
  user_id uuid primary key references auth.users(id) on update cascade on delete cascade,
  excluded_source_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_coach_context_preferences_allowed_sources check (
    excluded_source_ids <@ array[
      'recent_check_ins',
      'goals',
      'preferences',
      'weekly_practice',
      'recent_coaching'
    ]::text[]
  )
);

alter table public.ai_coach_context_preferences enable row level security;

create policy "ai_coach_context_preferences: select own"
  on public.ai_coach_context_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ai_coach_context_preferences from public, anon, authenticated;
grant select on table public.ai_coach_context_preferences to authenticated;
grant select, insert, update, delete on table public.ai_coach_context_preferences to service_role;

comment on table public.ai_coach_context_preferences is
  'Member-controlled exclusions for optional longitudinal context used by Ask LVE360. Core Routine, health profile, evidence, and safety sources cannot be excluded here.';

-- Rollback:
-- drop table if exists public.ai_coach_context_preferences;
