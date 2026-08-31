-- PR107: privacy-safe diagnostics for Ask LVE360 Coaching Engine v2.
alter table public.ai_coaching_turns
  add column intent text,
  add column quality_score smallint,
  add column safety_rule_count smallint not null default 0,
  add column recommendations_removed smallint not null default 0,
  add column regeneration_count smallint not null default 0,
  add column evidence_ids jsonb not null default '[]'::jsonb;

alter table public.ai_coaching_turns
  add constraint ai_coaching_turns_intent check (
    intent is null or intent in (
      'GENERAL_EDUCATION',
      'PERSONALIZED_RECOMMENDATION',
      'CURRENT_PLAN_LOOKUP',
      'OPTION_COMPARISON',
      'PLAN_EXPLANATION',
      'TIMING_OR_DOSING',
      'PROGRESS_COACHING',
      'REQUEST_TO_CHANGE_RECORD',
      'POTENTIAL_MEDICAL_RED_FLAG'
    )
  ),
  add constraint ai_coaching_turns_quality_score check (quality_score is null or quality_score between 0 and 100),
  add constraint ai_coaching_turns_safety_rule_count check (safety_rule_count >= 0),
  add constraint ai_coaching_turns_recommendations_removed check (recommendations_removed >= 0),
  add constraint ai_coaching_turns_regeneration_count check (regeneration_count between 0 and 2),
  add constraint ai_coaching_turns_evidence_ids_array check (jsonb_typeof(evidence_ids) = 'array');

comment on column public.ai_coaching_turns.intent is
  'Deterministically classified coaching intent used to assemble only relevant context.';
comment on column public.ai_coaching_turns.quality_score is
  'Aggregate 0-100 score from the deterministic response quality gate.';
comment on column public.ai_coaching_turns.evidence_ids is
  'Stable identifiers for curated LVE360 evidence used by the answer; contains no raw health data.';

-- Existing row-level security and grants are intentionally unchanged. Members can
-- continue selecting only their own coaching turns; all writes remain service-role only.
