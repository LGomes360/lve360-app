create table public.ai_coaching_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on update cascade on delete cascade,
  page_context text not null,
  question text not null,
  answer text not null default '',
  response_source text not null default 'fallback',
  generation_status text not null default 'pending',
  prompt_version text not null default 'contextual-coach-v1',
  source_refs jsonb not null default '[]'::jsonb,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_coaching_turns_page_context check (page_context in ('today', 'routine', 'blueprint', 'journey', 'review', 'settings', 'other')),
  constraint ai_coaching_turns_question_length check (char_length(question) between 4 and 500),
  constraint ai_coaching_turns_answer_length check (char_length(answer) <= 4000),
  constraint ai_coaching_turns_response_source check (response_source in ('ai', 'deterministic', 'fallback', 'safety', 'budget')),
  constraint ai_coaching_turns_generation_status check (generation_status in ('pending', 'succeeded', 'failed', 'blocked', 'limited')),
  constraint ai_coaching_turns_feedback check (feedback is null or feedback in ('useful', 'not_useful')),
  constraint ai_coaching_turns_source_refs_array check (jsonb_typeof(source_refs) = 'array')
);

create index ai_coaching_turns_user_created_idx
  on public.ai_coaching_turns (user_id, created_at desc);

alter table public.ai_coaching_turns enable row level security;

create policy "ai_coaching_turns: select own"
  on public.ai_coaching_turns for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ai_coaching_turns from public, anon, authenticated;
grant select on table public.ai_coaching_turns to authenticated;
grant select, insert, update, delete on table public.ai_coaching_turns to service_role;

comment on table public.ai_coaching_turns is
  'Member-owned Ask LVE360 question history, grounded-source references, generation state, and usefulness feedback. Writes are server-only.';
comment on column public.ai_coaching_turns.source_refs is
  'Compact labels and correction links for the member records used by the answer. Do not store raw intake payloads here.';

-- Rollback:
-- drop table if exists public.ai_coaching_turns;
