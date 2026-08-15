# Ask LVE360 task-success validation

PR110 replaces the production coach's generic answer-shape score with deterministic validators for the job the member actually requested.

## Validation path

Each coaching request now follows this bounded path:

1. Use the PR109 intent and explicit constraints.
2. Prefer a deterministic task answer when one exists.
3. Validate the rendered answer against the canonical member context.
4. For a model answer, measure intent-specific completeness and factual coverage.
5. If the first candidate fails, make one repair request containing the failed validator codes, missing requirements, and constraint violations.
6. If the repair still fails, use a grounded deterministic fallback.
7. If that fallback cannot complete the task, return a narrow non-guessing response and record the turn as failed.

There is no open-ended retry loop.

## Intent-specific checks

- Regimen lookup checks every requested saved item, requested fields, and exclusion of unrequested item types.
- Safety review checks each unresolved deterministic finding, its reason, and preserved regimen boundaries.
- Behavioral coaching checks active-practice use, requested time horizon, and every explicit preserve-plan constraint.
- Prioritization checks alignment with the active weekly practice or an explicit no-practice state.
- Missing-context analysis checks actual missing fields and rejects claims that existing profile, goal, or practice data is missing.
- Progress coaching checks requested metrics and appropriately bounded causal language.
- Evidence comparison checks grounded option coverage and reasoning.
- Out-of-scope requests check that Ask LVE360 preserves its product boundary.

## Score compatibility

`quality_score` remains a 0 to 100 column for compatibility, but it is now derived from the average completeness of the required validators. A response with a missing factual item, requested field, safety reason, or violated constraint cannot score 100.

## Observability and privacy

The existing `response_source`, `generation_status`, `quality_score`, and `regeneration_count` fields make the final outcome and bounded repair visible without a migration. Privacy-safe server diagnostics add:

- intent
- task-success status
- completeness and factual coverage
- failed validator IDs
- counts of missing requirements and constraint violations
- repair and fallback reason codes

The member's question, regimen names, and health facts are not included in validation logs.

## Database impact

No migration is required. Detailed validator results remain in server diagnostics for this PR; the existing database columns preserve the durable compatibility signals.
