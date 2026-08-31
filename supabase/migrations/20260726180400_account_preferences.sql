create table if not exists public.user_preferences (
  user_id uuid primary key references public.users(id) on update cascade on delete cascade,
  preferred_name text,
  weight_unit text not null default 'lb',
  reminder_preference text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_name_length check (
    preferred_name is null or char_length(preferred_name) between 1 and 80
  ),
  constraint user_preferences_weight_unit check (weight_unit in ('lb', 'kg')),
  constraint user_preferences_reminder check (reminder_preference in ('none', 'email'))
);

alter table public.user_preferences enable row level security;

create policy "user_preferences: select own"
  on public.user_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_preferences: insert own"
  on public.user_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_preferences: update own"
  on public.user_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.user_preferences from anon;
grant select, insert, update on public.user_preferences to authenticated;

comment on table public.user_preferences is
  'User-controlled display and reminder preferences. No health measurements are stored here.';
