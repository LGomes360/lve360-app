# Durable Practice domain

## Purpose

PR149 introduces a durable Practice as canonical member state. A Practice can own several weekly experiments so that changing a cue, frequency, or minimum version does not erase the behavioral thread the member is building.

This is a schema and domain-foundation PR. It does not change the member interface, create Practice rows, backfill existing experiments, or change Today, Journey, reminders, or weekly review behavior.

## Practice versus weekly experiment

| Record | Meaning | Example |
| --- | --- | --- |
| Practice | The durable behavior the member is maintaining | Walk after lunch |
| Weekly experiment | One dated configuration used to test that Practice | Walk after lunch five days this week, with a two-minute minimum |
| Completion | What the member recorded on one date | Minimum version completed on Tuesday |
| Weekly review | What the member observed and decided after the week | Shrink to four planned sessions |

Completions, check-ins, weekly reviews, AI summaries, and product analytics never become Practice state automatically.

## Continuity rules

- **Keep, shrink, and build on it:** the next weekly experiment retains the same Practice ID.
- **Pause:** the Practice remains in history with a paused status and no next experiment is created.
- **Swap:** the prior Practice is archived and the replacement receives a new Practice ID.
- **AI suggestions:** may prefill a proposed Practice but cannot create or change canonical Practice state without member confirmation.

## Migration boundary

The migration creates `public.practices` and a nullable `weekly_experiments.practice_id` foreign key. Existing weekly experiments remain untouched.

The table:

- uses owner-scoped Row Level Security;
- grants authenticated members read-only access;
- reserves writes for server-side service-role workflows;
- includes indexes for member status, Blueprint provenance, goal provenance, and weekly-experiment lineage;
- cascades account deletion through `user_id`;
- preserves experiment history if an individual Practice is removed by setting its foreign key to null.

## PR150 handoff

PR150 will:

1. Backfill historical experiments into stable Practice groups.
2. Create a Practice when a member confirms a complete activation.
3. Carry the Practice ID through weekly review decisions.
4. Keep null `practice_id` compatible while reconciliation is incomplete.
5. Add Practice state to member context and account export after the production migration is confirmed.

## Rollback

Drop the experiment linkage index, drop `weekly_experiments.practice_id`, and then drop `public.practices`. PR149 does not modify existing experiment rows, so rollback requires no data restore.
