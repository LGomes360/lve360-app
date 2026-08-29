-- PR146: add covering indexes for the five foreign keys reported by the
-- Supabase Performance Advisor.
--
-- These B-tree indexes improve joins and parent-row updates/deletes without
-- changing constraints, row-level security, or application behavior.

create index if not exists ai_weekly_syntheses_next_experiment_idx
  on public.ai_weekly_syntheses (next_experiment_id);

create index if not exists coach_action_events_user_id_idx
  on public.coach_action_events (user_id);

create index if not exists coach_action_proposals_applied_experiment_idx
  on public.coach_action_proposals (applied_experiment_id);

create index if not exists recommendation_decisions_stack_id_idx
  on public.recommendation_decisions (stack_id);

create index if not exists weekly_experiments_source_stack_id_idx
  on public.weekly_experiments (source_stack_id);

-- Rollback notes:
-- Drop the five indexes above by name. The foreign-key constraints and all
-- member data remain intact because this migration changes indexes only.
