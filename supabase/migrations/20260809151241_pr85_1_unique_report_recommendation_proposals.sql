-- Prevent concurrent page loads from materializing the same report-only idea twice.
-- Rollback: drop index if exists public.stacks_items_unique_report_proposal_idx;
create unique index if not exists stacks_items_unique_report_proposal_idx
  on public.stacks_items (stack_id, lower(btrim(name)))
  where is_current = false;

comment on index public.stacks_items_unique_report_proposal_idx is
  'One live proposal per normalized supplement name and Blueprint stack; dated report text remains immutable.';
