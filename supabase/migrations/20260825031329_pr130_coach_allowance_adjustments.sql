create table public.ai_coach_allowance_adjustments (
  user_id uuid not null references auth.users(id) on update cascade on delete cascade,
  period_start date not null,
  additional_turns smallint not null default 0,
  reason text not null,
  granted_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start),
  constraint ai_coach_allowance_adjustments_month_start
    check (period_start = date_trunc('month', period_start)::date),
  constraint ai_coach_allowance_adjustments_turn_range
    check (additional_turns between 0 and 100),
  constraint ai_coach_allowance_adjustments_reason_length
    check (char_length(reason) between 5 and 300),
  constraint ai_coach_allowance_adjustments_granted_by_length
    check (char_length(granted_by) between 2 and 120)
);

alter table public.ai_coach_allowance_adjustments enable row level security;

revoke all on table public.ai_coach_allowance_adjustments from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_coach_allowance_adjustments to service_role;

comment on table public.ai_coach_allowance_adjustments is
  'Server-managed monthly Ask LVE360 testing allowances. Adjustments add question turns but never raise the production dollar cost ceiling.';
comment on column public.ai_coach_allowance_adjustments.additional_turns is
  'Operator-approved question turns added to the base monthly allowance for this UTC month, capped at 100.';
comment on column public.ai_coach_allowance_adjustments.reason is
  'Required audit reason for the testing adjustment. Do not store health information.';

-- Rollback:
-- drop table if exists public.ai_coach_allowance_adjustments;
