-- PR187: member-approved ChatGPT Health summaries for the private founder pilot.
-- This table deliberately stores bounded prose summaries, never raw HealthKit
-- samples, medical records, workout routes, diagnoses, or medication changes.

create table if not exists public.health_context_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  snapshot_date date not null,
  source_window_start date not null,
  source_window_end date not null,
  sleep_summary text not null,
  sleep_data_completeness text not null,
  exercise_summary text not null,
  exercise_data_completeness text not null,
  diet_weight_summary text not null,
  diet_weight_data_completeness text not null,
  overall_feeling_summary text not null,
  overall_feeling_data_completeness text not null,
  lab_balance_summary text not null,
  lab_balance_data_completeness text not null,
  lab_result_window_start date not null,
  lab_result_window_end date not null,
  lab_measurement_context text not null,
  lab_interpretation_basis text not null,
  proposed_focus text not null,
  member_approved boolean not null,
  source text not null default 'chatgpt_health',
  created_at timestamptz not null default now(),
  constraint health_context_handoffs_source_window_check
    check (source_window_start <= source_window_end and source_window_end <= snapshot_date),
  constraint health_context_handoffs_lab_window_check
    check (lab_result_window_start <= lab_result_window_end and lab_result_window_end <= snapshot_date),
  constraint health_context_handoffs_member_approved_check check (member_approved is true),
  constraint health_context_handoffs_source_check check (source = 'chatgpt_health'),
  constraint health_context_handoffs_lab_basis_check
    check (lab_interpretation_basis = 'source_lab_reference_ranges'),
  constraint health_context_handoffs_summary_lengths_check check (
    length(sleep_summary) between 1 and 600
    and length(exercise_summary) between 1 and 600
    and length(diet_weight_summary) between 1 and 600
    and length(overall_feeling_summary) between 1 and 600
    and length(lab_balance_summary) between 1 and 600
  ),
  constraint health_context_handoffs_completeness_lengths_check check (
    length(sleep_data_completeness) between 1 and 300
    and length(exercise_data_completeness) between 1 and 300
    and length(diet_weight_data_completeness) between 1 and 300
    and length(overall_feeling_data_completeness) between 1 and 300
    and length(lab_balance_data_completeness) between 1 and 300
  ),
  constraint health_context_handoffs_lab_context_length_check
    check (length(lab_measurement_context) between 1 and 800),
  constraint health_context_handoffs_focus_length_check
    check (length(proposed_focus) between 1 and 300)
);

comment on table public.health_context_handoffs is
  'Member-approved, five-area summary handoffs from ChatGPT Health. Contains no raw health samples or records.';
comment on column public.health_context_handoffs.lab_measurement_context is
  'Short member-approved context retaining units and the source laboratory reference-range basis.';

create index if not exists health_context_handoffs_user_created_idx
  on public.health_context_handoffs (user_id, created_at desc);

alter table public.health_context_handoffs enable row level security;

drop policy if exists "Members can view approved health handoffs" on public.health_context_handoffs;
create policy "Members can view approved health handoffs"
  on public.health_context_handoffs for select to authenticated
  using ((select auth.uid()) = user_id and member_approved is true);

drop policy if exists "Members can insert approved health handoffs" on public.health_context_handoffs;
create policy "Members can insert approved health handoffs"
  on public.health_context_handoffs for insert to authenticated
  with check ((select auth.uid()) = user_id and member_approved is true);

drop policy if exists "Members can delete their health handoffs" on public.health_context_handoffs;
create policy "Members can delete their health handoffs"
  on public.health_context_handoffs for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.health_context_handoffs from public, anon, authenticated;
grant select, insert, delete on table public.health_context_handoffs to authenticated;
grant all on table public.health_context_handoffs to service_role;
