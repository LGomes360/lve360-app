-- PR72: separate the member's current regimen from immutable Blueprint history.
create table if not exists public.current_regimen_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_submission_id uuid references public.submissions(id) on delete set null,
  source_stack_item_id uuid references public.stacks_items(id) on delete set null,
  item_kind text not null check (item_kind in ('medication', 'supplement', 'hormone', 'endocrine_active_supplement')),
  name text not null,
  normalized_name text not null,
  purpose text,
  dose text,
  timing text,
  instruction_source text not null check (instruction_source in ('intake', 'member_update', 'adopted_recommendation', 'manual_add')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists current_regimen_items_user_kind_name_key
  on public.current_regimen_items (user_id, item_kind, normalized_name);
create index if not exists current_regimen_items_user_active_idx
  on public.current_regimen_items (user_id, active, updated_at desc);
create index if not exists current_regimen_items_source_submission_idx
  on public.current_regimen_items (source_submission_id);
create index if not exists current_regimen_items_source_stack_item_idx
  on public.current_regimen_items (source_stack_item_id);

alter table public.current_regimen_items enable row level security;

drop policy if exists "current_regimen_items: select own" on public.current_regimen_items;
create policy "current_regimen_items: select own"
  on public.current_regimen_items for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "current_regimen_items: insert own" on public.current_regimen_items;
create policy "current_regimen_items: insert own"
  on public.current_regimen_items for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "current_regimen_items: update own" on public.current_regimen_items;
create policy "current_regimen_items: update own"
  on public.current_regimen_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "current_regimen_items: delete own" on public.current_regimen_items;
create policy "current_regimen_items: delete own"
  on public.current_regimen_items for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, update on public.current_regimen_items to authenticated;
grant select, insert, update, delete on public.current_regimen_items to service_role;

-- Daily adherence follows stable regimen IDs instead of report-version row IDs.
alter table public.intake_events alter column item_id drop not null;
alter table public.intake_events
  add column if not exists regimen_item_id uuid references public.current_regimen_items(id) on delete cascade;
create index if not exists intake_events_regimen_item_idx
  on public.intake_events (regimen_item_id);
create unique index if not exists intake_events_user_regimen_date_key
  on public.intake_events (user_id, regimen_item_id, intake_date);

-- Rollback notes:
-- Drop intake_events_user_regimen_date_key and regimen_item_id, restore item_id NOT NULL
-- after confirming every new event has an item_id, then drop current_regimen_items.
