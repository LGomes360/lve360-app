# PR146 foreign-key index optimization

## Purpose

Resolve the five `unindexed_foreign_keys` notices reported by the Supabase
Performance Advisor after PR145. These indexes support relationship lookups and
referential-integrity checks as the member, coaching, and weekly-learning tables
grow.

## Indexes added

| Table | Foreign-key column | Index |
| --- | --- | --- |
| `ai_weekly_syntheses` | `next_experiment_id` | `ai_weekly_syntheses_next_experiment_idx` |
| `coach_action_events` | `user_id` | `coach_action_events_user_id_idx` |
| `coach_action_proposals` | `applied_experiment_id` | `coach_action_proposals_applied_experiment_idx` |
| `recommendation_decisions` | `stack_id` | `recommendation_decisions_stack_id_idx` |
| `weekly_experiments` | `source_stack_id` | `weekly_experiments_source_stack_id_idx` |

## Safety and behavior

- Uses standard B-tree indexes, which match the equality joins used by foreign
  keys.
- Does not change tables, constraints, RLS policies, permissions, or data.
- Uses `if not exists` so a repeated deployment does not fail if an equivalent
  named index is already present.

## Production verification

After the migration is merged and applied:

1. Confirm all five index names exist in `pg_indexes`.
2. Confirm every target foreign key has a valid covering index.
3. Rerun the Supabase Performance Advisor and verify
   `unindexed_foreign_keys` is zero.
4. Rerun the Security Advisor and confirm its results are unchanged.

## Rollback

Drop the five indexes by name. Dropping them restores the prior performance
profile but does not remove foreign-key constraints or member data.
