-- PR76: structured member-recorded schedules and per-occurrence completion.
alter table public.current_regimen_items
  add column if not exists schedule jsonb;

alter table public.current_regimen_items
  drop constraint if exists current_regimen_items_schedule_check;

alter table public.current_regimen_items
  add constraint current_regimen_items_schedule_check
  check (
    schedule is null
    or (
      jsonb_typeof(schedule) = 'object'
      and schedule->>'cadence' in ('daily', 'every_n_days', 'weekdays', 'weekly', 'as_needed')
    )
  );

comment on column public.current_regimen_items.schedule is
  'Structured schedule copied from a member-reported clinician, pharmacist, prescription label, or product label instruction. Never generated as dosing advice.';

alter table public.current_regimen_items
  drop constraint if exists current_regimen_items_instruction_authority_check;

alter table public.current_regimen_items
  add constraint current_regimen_items_instruction_authority_check
  check (
    instruction_authority is null
    or instruction_authority in ('clinician', 'pharmacist', 'medication_label', 'product_label')
  );

create table if not exists public.regimen_dose_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  regimen_item_id uuid not null references public.current_regimen_items(id) on delete cascade,
  scheduled_date date not null,
  slot_key text not null check (char_length(slot_key) between 1 and 80),
  scheduled_time time,
  status text not null check (status in ('taken', 'skipped')),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regimen_dose_events_user_item_date_slot_key
    unique (user_id, regimen_item_id, scheduled_date, slot_key)
);

create index if not exists regimen_dose_events_user_date_idx
  on public.regimen_dose_events (user_id, scheduled_date desc, recorded_at desc);

create index if not exists regimen_dose_events_regimen_item_idx
  on public.regimen_dose_events (regimen_item_id, scheduled_date desc);

alter table public.regimen_dose_events enable row level security;

drop policy if exists "regimen_dose_events: select own" on public.regimen_dose_events;
create policy "regimen_dose_events: select own"
  on public.regimen_dose_events for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.regimen_dose_events from public, anon, authenticated;
grant select on table public.regimen_dose_events to authenticated;
grant select, insert, update, delete on table public.regimen_dose_events to service_role;

comment on table public.regimen_dose_events is
  'Owner-scoped records of member-confirmed taken or skipped regimen occurrences. A skipped event is not a clinical recommendation or missed-dose instruction.';

-- Rollback notes:
-- Drop regimen_dose_events first, then remove current_regimen_items.schedule.
-- Restore the prior instruction-authority constraint without product_label only after
-- confirming no current row uses that provenance value.
