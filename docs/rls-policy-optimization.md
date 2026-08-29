# PR145 RLS policy optimization

## Purpose

Supabase Advisor identified two related performance problems in the original
member-isolation policies:

- Five tables evaluate two permissive `SELECT` policies for the same member.
- Seven policies call `auth.uid()` once for every candidate row instead of once
  for the statement.

PR145 removes only policies whose allowed rows are already fully covered by a
newer policy. It then recreates the remaining direct-ownership policies using
`(select auth.uid())`, the Supabase-recommended cached form.

## Preserved access model

| Table | Member access after PR145 |
| --- | --- |
| `users`, `logs`, `submissions` | The signed-in member's own rows |
| `stacks` | Rows owned directly by the member or attached to the member's submission |
| `stacks_items` | Rows whose parent stack belongs to the member |
| Submission medications, supplements, and hormones | Rows whose parent submission belongs to the member |

All policies remain limited to `authenticated`. PR145 does not add table grants,
change service-role behavior, or broaden any write policy.

## Removed policy snapshot

The following policies are removed because each is a strict subset of the
remaining policy on the same table:

```sql
create policy "stacks: select own" on public.stacks
  for select to authenticated using (user_id = auth.uid());

create policy "stacks_items: select via owned stack" on public.stacks_items
  for select to authenticated using (
    stack_id in (select id from public.stacks where user_id = auth.uid())
  );

create policy "submission_medications: select via owned submission"
  on public.submission_medications for select to authenticated using (
    submission_id in (select id from public.submissions where user_id = auth.uid())
  );

create policy "submission_supplements: select via owned submission"
  on public.submission_supplements for select to authenticated using (
    submission_id in (select id from public.submissions where user_id = auth.uid())
  );

create policy "submission_hormones: select via owned submission"
  on public.submission_hormones for select to authenticated using (
    submission_id in (select id from public.submissions where user_id = auth.uid())
  );
```

## Deployment verification

Before applying the migration permanently, run it inside a transaction and test
two different authenticated member UUIDs. For each identity, verify that every
visible row satisfies the retained ownership predicate and that the other
member's direct rows remain invisible. Roll back the transaction after testing.

After applying the merged migration:

1. Repeat the two-member isolation checks.
2. Verify ordinary member reads and writes on Today, Routine, Blueprints, and
   Settings still succeed.
3. Rerun Supabase Performance Advisor. The 12 `auth_rls_initplan` warnings and
   five `multiple_permissive_policies` warnings should be gone.

## Rollback

This migration changes policies only and does not modify member data. If a
verified compatibility regression occurs, recreate only the affected legacy
policy from the snapshot above. Do not disable RLS. The cached `(select
auth.uid())` predicates preserve the previous ownership rule and do not require
rollback.
