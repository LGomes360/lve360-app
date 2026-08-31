create table if not exists public.weekly_experiment_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  experiment_id uuid not null references public.weekly_experiments(id) on update cascade on delete cascade,
  completion_count smallint not null,
  target_count smallint not null,
  difficulty smallint,
  value_rating smallint,
  decision text,
  status text not null default 'draft',
  next_experiment_id uuid references public.weekly_experiments(id) on update cascade on delete set null,
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_experiment_reviews_one_per_experiment unique (experiment_id),
  constraint weekly_experiment_reviews_completion_count check (completion_count between 0 and 7),
  constraint weekly_experiment_reviews_target_count check (target_count between 1 and 7),
  constraint weekly_experiment_reviews_difficulty check (difficulty is null or difficulty between 1 and 5),
  constraint weekly_experiment_reviews_value check (value_rating is null or value_rating between 1 and 5),
  constraint weekly_experiment_reviews_decision check (decision is null or decision in ('keep', 'shrink', 'swap', 'pause', 'advance')),
  constraint weekly_experiment_reviews_status check (status in ('draft', 'completed')),
  constraint weekly_experiment_reviews_completed_fields check (
    status <> 'completed' or (difficulty is not null and value_rating is not null and decision is not null and completed_at is not null)
  )
);

create index if not exists weekly_experiment_reviews_user_completed_idx
  on public.weekly_experiment_reviews (user_id, completed_at desc);

alter table public.weekly_experiment_reviews enable row level security;

create policy "weekly_experiment_reviews: select own"
  on public.weekly_experiment_reviews for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.weekly_experiment_reviews from public, anon, authenticated;
grant select on table public.weekly_experiment_reviews to authenticated;
grant select, insert, update, delete on table public.weekly_experiment_reviews to service_role;

create or replace function public.complete_weekly_review(
  p_user_id uuid,
  p_experiment_id uuid,
  p_difficulty smallint,
  p_value_rating smallint,
  p_decision text,
  p_action_label text default null,
  p_cue text default null,
  p_frequency_per_week smallint default null,
  p_minimum_version text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_experiment public.weekly_experiments%rowtype;
  next_id uuid;
  completed_reps smallint;
begin
  if p_difficulty not between 1 and 5
    or p_value_rating not between 1 and 5
    or p_decision not in ('keep', 'shrink', 'swap', 'pause', 'advance') then
    raise exception 'invalid_review';
  end if;

  select * into current_experiment
  from public.weekly_experiments
  where id = p_experiment_id and user_id = p_user_id and status = 'active'
  for update;

  if not found then
    raise exception 'active_experiment_not_found';
  end if;

  if current_date < current_experiment.week_start + 6 then
    raise exception 'review_not_due';
  end if;

  if exists (
    select 1 from public.weekly_experiment_reviews
    where experiment_id = p_experiment_id and status = 'completed'
  ) then
    raise exception 'review_already_completed';
  end if;

  select count(distinct completion_date)::smallint into completed_reps
  from public.daily_practice_completions
  where user_id = p_user_id
    and experiment_id = p_experiment_id
    and completion_date between current_experiment.week_start and current_experiment.week_start + 6;

  update public.weekly_experiments
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_experiment_id;

  if p_decision <> 'pause' then
    if p_action_label is null or char_length(btrim(p_action_label)) not between 4 and 240
      or p_cue is null or char_length(btrim(p_cue)) not between 2 and 160
      or p_frequency_per_week not between 1 and 7
      or p_minimum_version is null or char_length(btrim(p_minimum_version)) not between 2 and 160 then
      raise exception 'invalid_next_experiment';
    end if;

    insert into public.weekly_experiments (
      user_id, identity_direction, action_label, cue, frequency_per_week,
      minimum_version, reminder_preference, onboarding_step, status,
      week_start, activated_at
    ) values (
      p_user_id, current_experiment.identity_direction, btrim(p_action_label), btrim(p_cue),
      p_frequency_per_week, btrim(p_minimum_version), current_experiment.reminder_preference,
      6, 'active', (current_experiment.week_start + 7), now()
    ) returning id into next_id;
  end if;

  insert into public.weekly_experiment_reviews (
    user_id, experiment_id, completion_count, target_count, difficulty,
    value_rating, decision, status, next_experiment_id, completed_at, updated_at
  ) values (
    p_user_id, p_experiment_id, completed_reps, current_experiment.frequency_per_week,
    p_difficulty, p_value_rating, p_decision, 'completed', next_id, now(), now()
  ) on conflict (experiment_id) do update set
    completion_count = excluded.completion_count,
    target_count = excluded.target_count,
    difficulty = excluded.difficulty,
    value_rating = excluded.value_rating,
    decision = excluded.decision,
    status = 'completed',
    next_experiment_id = excluded.next_experiment_id,
    completed_at = excluded.completed_at,
    updated_at = excluded.updated_at;

  return next_id;
end;
$$;

revoke all on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text)
  from public, anon, authenticated;
grant execute on function public.complete_weekly_review(uuid, uuid, smallint, smallint, text, text, text, smallint, text)
  to service_role;

comment on table public.weekly_experiment_reviews is
  'Privacy-minimized weekly review outcomes. Freeform health notes are intentionally excluded.';

comment on function public.complete_weekly_review is
  'Atomically completes a due weekly lifestyle experiment, stores its review, and optionally creates the next active week.';
