-- PR126: one private daily intention session per member and local date.
create table public.daily_intentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  local_date date not null,
  phrase text,
  focus_word text,
  source text,
  suggestions jsonb not null default '[]'::jsonb,
  suggestion_source text,
  suggestion_context_hash text,
  prompt_version text,
  ai_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_intentions_one_per_day unique (user_id, local_date),
  constraint daily_intentions_phrase_length check (phrase is null or char_length(btrim(phrase)) between 3 and 120),
  constraint daily_intentions_focus_word_length check (focus_word is null or char_length(btrim(focus_word)) between 2 and 30),
  constraint daily_intentions_source_check check (source is null or source in ('self', 'ask_lve360')),
  constraint daily_intentions_suggestions_check check (
    jsonb_typeof(suggestions) = 'array' and jsonb_array_length(suggestions) <= 3
  ),
  constraint daily_intentions_suggestion_source_check check (
    suggestion_source is null or suggestion_source in ('ai', 'fallback')
  ),
  constraint daily_intentions_context_hash_check check (
    suggestion_context_hash is null or suggestion_context_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint daily_intentions_prompt_version_check check (
    prompt_version is null or char_length(prompt_version) between 1 and 120
  ),
  constraint daily_intentions_selected_fields_check check (
    (phrase is null and focus_word is null and source is null)
    or (phrase is not null and source is not null)
  )
);

create index daily_intentions_user_date_idx
  on public.daily_intentions (user_id, local_date desc);

alter table public.daily_intentions enable row level security;

-- All access is server-mediated so the API can enforce paid membership,
-- date validation, and the behavioral linter before any write.
revoke all on table public.daily_intentions from public, anon, authenticated;
grant select, insert, update, delete on table public.daily_intentions to service_role;

comment on table public.daily_intentions is
  'Server-mediated daily mindset intentions and up to three cached Ask LVE360 suggestions. Raw member reflection prompts are never stored.';

comment on column public.daily_intentions.suggestion_context_hash is
  'SHA-256 fingerprint of the minimum suggestion context. The underlying free-text reflection is not retained.';

-- Rollback: drop public.daily_intentions. This removes only optional daily
-- intention records and cached suggestions; no Blueprint, Routine, or health
-- record data is affected.
