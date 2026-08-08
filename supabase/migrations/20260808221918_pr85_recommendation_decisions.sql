create table if not exists public.recommendation_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stack_id uuid not null references public.stacks(id) on delete cascade,
  stack_item_id uuid not null references public.stacks_items(id) on delete cascade,
  recommendation_key text not null,
  context_fingerprint text not null,
  status text not null default 'review'
    check (status in ('review', 'clinician_review', 'deferred', 'dismissed', 'adopted')),
  reason_snapshot text not null,
  overlap_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(overlap_snapshot) = 'array'),
  deferred_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, recommendation_key, context_fingerprint)
);

create index if not exists recommendation_decisions_user_status_idx
  on public.recommendation_decisions (user_id, status, updated_at desc);

create index if not exists recommendation_decisions_stack_item_idx
  on public.recommendation_decisions (stack_item_id);

alter table public.recommendation_decisions enable row level security;

create policy "recommendation_decisions: select own"
  on public.recommendation_decisions for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.recommendation_decisions from anon;
revoke insert, update, delete on table public.recommendation_decisions from authenticated;
grant select on table public.recommendation_decisions to authenticated;
grant select, insert, update, delete on table public.recommendation_decisions to service_role;

comment on table public.recommendation_decisions is
  'Owner-scoped live decisions layered over dated Blueprint recommendations. Dismissal and deferral never rewrite historical Blueprint content.';
