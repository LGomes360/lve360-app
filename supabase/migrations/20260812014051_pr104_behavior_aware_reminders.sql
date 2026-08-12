create table public.reminder_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  experiment_id uuid not null references public.weekly_experiments(id) on update cascade on delete cascade,
  delivery_id uuid not null references public.reminder_deliveries(id) on update cascade on delete cascade,
  feedback_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_feedback_delivery_unique unique (delivery_id),
  constraint reminder_feedback_type check (
    feedback_type in ('useful', 'too_early', 'too_late', 'not_useful', 'dismissed')
  )
);

create index reminder_feedback_user_created_idx
  on public.reminder_feedback (user_id, created_at desc);

create index reminder_feedback_experiment_created_idx
  on public.reminder_feedback (experiment_id, created_at desc);

alter table public.reminder_feedback enable row level security;

create policy "reminder_feedback: select own"
  on public.reminder_feedback for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.reminder_feedback from public, anon, authenticated;
grant select on public.reminder_feedback to authenticated;
grant select, insert, update, delete on public.reminder_feedback to service_role;

create table public.reminder_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  experiment_id uuid not null references public.weekly_experiments(id) on update cascade on delete cascade,
  adjustment_kind text not null,
  current_hour smallint,
  proposed_hour smallint,
  trigger_reason text not null,
  evidence_count smallint not null,
  status text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz not null default now(),
  constraint reminder_adjustments_kind check (adjustment_kind in ('time', 'pause')),
  constraint reminder_adjustments_hours check (
    current_hour between 0 and 23
    and (
      (adjustment_kind = 'time' and proposed_hour between 0 and 23)
      or (adjustment_kind = 'pause' and proposed_hour is null)
    )
  ),
  constraint reminder_adjustments_reason_length check (char_length(trigger_reason) between 3 and 80),
  constraint reminder_adjustments_evidence_count check (evidence_count between 1 and 99),
  constraint reminder_adjustments_status check (status in ('accepted', 'declined'))
);

create index reminder_adjustments_user_created_idx
  on public.reminder_adjustments (user_id, created_at desc);

create index reminder_adjustments_experiment_created_idx
  on public.reminder_adjustments (experiment_id, created_at desc);

alter table public.reminder_adjustments enable row level security;

create policy "reminder_adjustments: select own"
  on public.reminder_adjustments for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.reminder_adjustments from public, anon, authenticated;
grant select on public.reminder_adjustments to authenticated;
grant select, insert, update, delete on public.reminder_adjustments to service_role;

comment on table public.reminder_feedback is
  'Privacy-minimized member feedback tied to a delivered reminder. Message content is not stored.';

comment on table public.reminder_adjustments is
  'Auditable member decisions on deterministic reminder suggestions. Suggested timing is never applied without acceptance.';

-- Rollback: drop public.reminder_adjustments and public.reminder_feedback.
