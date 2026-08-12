alter table public.ai_coaching_turns
  drop constraint ai_coaching_turns_response_source;

alter table public.ai_coaching_turns
  add constraint ai_coaching_turns_response_source
  check (response_source in ('ai', 'deterministic', 'fallback', 'safety', 'budget'));

comment on column public.ai_coaching_turns.response_source is
  'Distinguishes paid model output, deterministic grounded answers, fallbacks, safety boundaries, and budget limits for honest quality and cost analysis.';

-- Rollback:
-- Update deterministic rows to fallback, then restore the original constraint without deterministic.
