create table if not exists public.daily_practice_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  experiment_id uuid not null references public.weekly_experiments(id) on update cascade on delete cascade,
  completion_date date not null,
  completion_kind text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_practice_completions_kind check (completion_kind in ('full', 'minimum')),
  constraint daily_practice_completions_one_per_day unique (user_id, experiment_id, completion_date)
);

create index if not exists daily_practice_completions_user_date_idx
  on public.daily_practice_completions (user_id, completion_date desc);

create index if not exists daily_practice_completions_experiment_date_idx
  on public.daily_practice_completions (experiment_id, completion_date);

alter table public.daily_practice_completions enable row level security;

create policy "daily_practice_completions: select own"
  on public.daily_practice_completions for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.daily_practice_completions to authenticated;
grant select, insert, update, delete on public.daily_practice_completions to service_role;

comment on table public.daily_practice_completions is
  'One privacy-minimized completion state per member, active lifestyle practice, and local calendar day. Writes are handled by the paid Today API.';
