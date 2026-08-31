create index if not exists reminder_deliveries_experiment_created_idx
  on public.reminder_deliveries (experiment_id, created_at desc);

-- Rollback: drop index public.reminder_deliveries_experiment_created_idx.
