-- PR145: preserve member isolation while removing redundant policy work.
--
-- Supabase evaluates every permissive policy for a role/action. The legacy
-- SELECT policies below are strict subsets of the newer ownership policies,
-- so retaining both adds work without granting any additional legitimate row.

drop policy if exists "stacks: select own" on public.stacks;
drop policy if exists "stacks_items: select via owned stack" on public.stacks_items;
drop policy if exists "submission_medications: select via owned submission"
  on public.submission_medications;
drop policy if exists "submission_supplements: select via owned submission"
  on public.submission_supplements;
drop policy if exists "submission_hormones: select via owned submission"
  on public.submission_hormones;

-- Cache auth.uid() once per statement instead of evaluating it for every row.
-- Ownership semantics, roles, commands, and UPDATE checks remain unchanged.

drop policy if exists "logs: select own" on public.logs;
create policy "logs: select own"
  on public.logs
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "logs: insert own" on public.logs;
create policy "logs: insert own"
  on public.logs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "logs: update own" on public.logs;
create policy "logs: update own"
  on public.logs
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "submissions: select own" on public.submissions;
create policy "submissions: select own"
  on public.submissions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users: select own" on public.users;
create policy "users: select own"
  on public.users
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "users: insert own" on public.users;
create policy "users: insert own"
  on public.users
  for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "users: update own" on public.users;
create policy "users: update own"
  on public.users
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Rollback notes:
-- Recreate the five removed legacy SELECT policies from the policy snapshot in
-- docs/rls-policy-optimization.md only if a compatibility regression proves the
-- broader ownership policy is not equivalent. Reverting the cached auth.uid()
-- form is unnecessary because it changes evaluation frequency, not access.
