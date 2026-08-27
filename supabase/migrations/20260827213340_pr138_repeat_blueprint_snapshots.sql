alter table public.stacks
  add column if not exists snapshot_occurrence integer not null default 1;

alter table public.stacks
  drop constraint if exists stacks_snapshot_occurrence_positive;

alter table public.stacks
  add constraint stacks_snapshot_occurrence_positive
  check (snapshot_occurrence > 0);

drop index if exists public.stacks_submission_snapshot_key;

create unique index if not exists stacks_submission_snapshot_occurrence_key
  on public.stacks (submission_id, input_snapshot_hash, snapshot_occurrence)
  where input_snapshot_hash is not null;

create index if not exists stacks_submission_snapshot_lookup_idx
  on public.stacks (submission_id, input_snapshot_hash, snapshot_occurrence desc)
  where input_snapshot_hash is not null;

comment on column public.stacks.snapshot_occurrence is
  'Monotonic occurrence of the same immutable input snapshot. A later member refresh may intentionally reuse prior report content while remaining the latest dated Blueprint.';

-- Rollback notes:
-- 1. Keep only the newest row for each submission_id and input_snapshot_hash.
-- 2. Drop the two occurrence indexes and the positive-value constraint.
-- 3. Recreate stacks_submission_snapshot_key, then drop snapshot_occurrence.
