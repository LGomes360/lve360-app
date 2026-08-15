# Ask LVE360 intent-first routing

PR109 changes the coaching request path to:

1. Classify the member's requested job.
2. Capture explicit regimen constraints separately from the job.
3. Select only the context required for that job.
4. Retrieve exact saved facts from the canonical member context.
5. Use deterministic rendering for factual and bounded tasks.
6. Retrieve curated supplement evidence only for evidence-oriented jobs.
7. Use model synthesis only when interpretation adds value.

## Deterministic tasks

The model does not compose answers for:

- medication, hormone, supplement, or combined regimen lookup
- current deterministic safety-review findings
- missing-context analysis
- highest-value weekly prioritization when an active practice is available
- the poor-sleep behavioral regression with explicit regimen exclusions
- out-of-scope requests

Missing dose, timing, and schedule fields remain explicitly missing. Requested regimen categories are never replaced by other item types.

## Constraints

Phrases such as “without changing my medications or supplements” are represented independently from intent. The deterministic path enforces them directly, and any model path receives them as hard prompt constraints. Medication and hormone changes remain behind the existing safety boundary.

## Context and evidence

Ask LVE360 now builds one `MemberIntelligenceContext` snapshot per request. The coach adapter exposes only the sections required by the resolved intent. Behavioral, progress, prioritization, safety-review, and missing-context requests do not retrieve supplement evidence by default.

## Diagnostics compatibility

Detailed routing metadata is emitted to privacy-safe server logs without the member's question or health facts. The database keeps the existing coarse intent values so PR109 does not require a migration or break current Preview and Production schemas. Prompt telemetry is aligned on `contextual-coach-v3`.

Task-success scoring remains PR110. PR109 intentionally does not redesign the existing quality score.
