-- PR99: privacy-safe operational ledger for task-routed AI generations.
create table if not exists public.ai_generation_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  task text not null check (char_length(task) between 1 and 80),
  capability text not null check (capability in ('mini', 'main')),
  prompt_version text not null check (char_length(prompt_version) between 1 and 120),
  context_hash text not null check (context_hash ~ '^[0-9a-f]{64}$'),
  requested_model text not null check (char_length(requested_model) between 1 and 120),
  model_used text not null check (char_length(model_used) between 1 and 120),
  fallback_used boolean not null default false,
  status text not null check (status in ('succeeded', 'failed')),
  prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  cached_input_tokens integer check (cached_input_tokens is null or cached_input_tokens >= 0),
  completion_tokens integer check (completion_tokens is null or completion_tokens >= 0),
  reasoning_tokens integer check (reasoning_tokens is null or reasoning_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  estimated_cost_usd numeric(12, 8) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists ai_generation_ledger_user_created_idx
  on public.ai_generation_ledger (user_id, created_at desc);

create index if not exists ai_generation_ledger_task_created_idx
  on public.ai_generation_ledger (task, created_at desc);

create index if not exists ai_generation_ledger_context_hash_idx
  on public.ai_generation_ledger (context_hash, created_at desc);

alter table public.ai_generation_ledger enable row level security;

revoke all on table public.ai_generation_ledger from public, anon, authenticated;
grant select, insert on table public.ai_generation_ledger to service_role;

comment on table public.ai_generation_ledger is
  'Server-only AI operational metadata. Stores model, task, token, latency, cost estimate, and a one-way context hash; never prompts, responses, or raw health context.';

comment on column public.ai_generation_ledger.context_hash is
  'SHA-256 fingerprint used for evaluation and deduplication without storing the underlying member context.';

-- Rollback notes:
-- Drop public.ai_generation_ledger after exporting any operational metrics that
-- must be retained. The table is not referenced by member-facing product data.
