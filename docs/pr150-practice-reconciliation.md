# PR150: Durable Practice reconciliation

## Outcome

LVE360 now treats a Practice as the durable member commitment and a weekly experiment as one time-bounded attempt to carry it out. Existing activated history is reconciled without converting unfinished onboarding drafts.

## Continuity rules

- **Keep, shrink, or advance:** the next week retains the same Practice ID and updates its current configuration.
- **Pause:** the Practice remains available with a paused status and no new weekly experiment.
- **Swap:** the prior Practice is archived and the replacement week receives a new Practice ID.
- **Activation:** final member confirmation creates and links the Practice in one database transaction. Retrying the confirmation is idempotent.

## Historical reconciliation

Preserving review edges are grouped recursively. Swap edges start a new group. Each group receives one Practice with an auditable `origin_experiment_id`; all experiments in that group point to it. Partial drafts stay nullable until the member completes activation.

## Privacy and safety

The new write functions are executable only by the server role. Members retain owner-scoped read access through row-level security. No clinical guidance or regimen data is inferred or changed.

## Release order

1. Merge and deploy application code.
2. Apply `20260831030031_pr150_practice_reconciliation.sql` to production.
3. Verify every non-draft experiment has a Practice ID, every active experiment points to an active Practice, and incomplete drafts remain allowed to be null.
4. Run Supabase security and performance advisors.

## Rollback

Restore the PR125 weekly-review function and remove `activate_weekly_experiment`. Clear `weekly_experiments.practice_id` before deleting reconciled Practice rows, then remove the origin index and column. Historical experiments and reviews are never deleted by this migration.
