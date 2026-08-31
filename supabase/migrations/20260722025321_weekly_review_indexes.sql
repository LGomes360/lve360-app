create index if not exists weekly_experiment_reviews_next_experiment_idx
  on public.weekly_experiment_reviews (next_experiment_id)
  where next_experiment_id is not null;
