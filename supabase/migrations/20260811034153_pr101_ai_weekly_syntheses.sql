-- PR101: Cache evidence-grounded weekly AI reflections and member responses.
-- Server-only access is intentional. The browser reaches this data through paid,
-- authenticated application routes that verify row ownership.

create table if not exists public.ai_weekly_syntheses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  experiment_id uuid not null references public.weekly_experiments(id) on delete cascade,
  context_hash text not null check (length(context_hash) = 64),
  prompt_version text not null check (length(prompt_version) between 3 and 80),
  source text not null check (source in ('ai', 'fallback')),
  generation_status text not null check (generation_status in ('pending', 'succeeded', 'failed', 'skipped')),
  observation text not null check (length(observation) between 1 and 500),
  hypothesis text not null check (length(hypothesis) between 1 and 500),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  confidence text not null check (confidence in ('low', 'moderate')),
  suggested_decision text not null check (suggested_decision in ('keep', 'shrink', 'swap', 'pause', 'advance')),
  suggested_action_label text,
  suggested_cue text,
  suggested_frequency_per_week integer check (suggested_frequency_per_week between 1 and 7),
  suggested_minimum_version text,
  response_state text not null default 'none' check (response_state in ('none', 'accepted', 'edited', 'rejected')),
  next_experiment_id uuid references public.weekly_experiments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, experiment_id, context_hash)
);

create index if not exists ai_weekly_syntheses_user_updated_idx
  on public.ai_weekly_syntheses (user_id, updated_at desc);
create index if not exists ai_weekly_syntheses_experiment_idx
  on public.ai_weekly_syntheses (experiment_id);

alter table public.ai_weekly_syntheses enable row level security;
revoke all on table public.ai_weekly_syntheses from public, anon, authenticated;
grant select, insert, update on table public.ai_weekly_syntheses to service_role;

comment on table public.ai_weekly_syntheses is
  'Server-only cached weekly reflections. Observations are separated from non-causal hypotheses.';

-- Rollback:
-- drop table if exists public.ai_weekly_syntheses;
