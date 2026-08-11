-- PR100: one cached, privacy-minimized AI Today Brief per member context.
create table if not exists public.ai_today_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  local_date date not null,
  context_hash text not null check (context_hash ~ '^[0-9a-f]{64}$'),
  prompt_version text not null check (char_length(prompt_version) between 1 and 120),
  source text not null check (source in ('ai', 'fallback')),
  generation_status text not null check (generation_status in ('pending', 'succeeded', 'failed', 'skipped')),
  noticed text not null check (char_length(noticed) between 1 and 240),
  why_it_matters text not null check (char_length(why_it_matters) between 1 and 320),
  next_action text not null check (char_length(next_action) between 1 and 240),
  minimum_version text not null check (char_length(minimum_version) between 1 and 200),
  primary_action text not null check (primary_action in ('mark_complete', 'open_blueprint', 'open_review', 'none')),
  primary_href text check (primary_href is null or char_length(primary_href) between 1 and 300),
  feedback text check (feedback is null or feedback in ('useful', 'not_useful')),
  action_state text not null default 'none' check (action_state in ('none', 'completed', 'remind_later', 'opened_routine', 'dismissed')),
  remind_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_today_briefs_one_context unique (user_id, local_date, context_hash)
);

create index if not exists ai_today_briefs_user_date_idx
  on public.ai_today_briefs (user_id, local_date desc, created_at desc);

create index if not exists ai_today_briefs_feedback_idx
  on public.ai_today_briefs (feedback, updated_at desc)
  where feedback is not null;

alter table public.ai_today_briefs enable row level security;

revoke all on table public.ai_today_briefs from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_today_briefs to service_role;

comment on table public.ai_today_briefs is
  'Server-mediated daily coaching cache. Stores a short member-facing brief, one-way context fingerprint, and explicit feedback; never raw prompts or complete health records.';

comment on column public.ai_today_briefs.context_hash is
  'SHA-256 fingerprint of the minimum Today context and prompt version. It prevents repeat generation after page refreshes.';

-- Rollback notes:
-- Drop public.ai_today_briefs. The member experience will fall back to the
-- existing Today practice and Routine surfaces; no source health data is lost.
