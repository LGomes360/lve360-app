# Canonical member intelligence context

## Purpose

`getMemberIntelligenceContext(userId)` is the server-only, typed source of truth for the member facts required by LVE360's intelligence layer. It prepares the KNOW stage of the product loop without changing records or generating recommendations.

The contract is versioned as `member-intelligence-context-v1` and assembled by a pure function so it can be regression-tested without production data.

## Current architecture findings

The Trust-to-Intelligence audit was directionally correct. The current application has separate context assembly paths for Ask LVE360, Today, Journey, weekly synthesis, Blueprint, and Routine. `current_regimen_items` is already the canonical regimen source and preserves medication, hormone, supplement, and endocrine-active supplement types, but the AI context previously flattened selected data into loosely typed facts.

These details in the program brief required adjustment:

- The repository currently runs Next.js 15.5, although `AGENTS.md` still describes Next.js 14.
- Preferences live in `user_preferences`, not `account_preferences`.
- Weekly reviews live in `weekly_experiment_reviews`.
- The current schema stores Blueprint linkage on weekly practices, but it does not store an explicit practice-to-saved-goal relation. The context therefore reports that relation as `not_recorded` instead of guessing.
- Existing Blueprint context already centralizes freshness and safety acknowledgement, but it did not expose structured Blueprint goals.
- Safety provenance metadata is incomplete in the current rule tables. This PR reports the available source and source URL without fabricating clinical review metadata; the deeper provenance work remains in the dedicated safety PR.

## Contract

The context keeps materially different concepts separate:

- member identity and tier
- intake health profile
- explicit saved goals and numeric targets
- current Blueprint goals and priorities
- medications
- hormones
- supplements
- endocrine-active supplements
- active weekly practice
- recent practice history, completions, and reviews
- recent weight, sleep, and energy check-ins
- reminder and quiet-hour preferences
- unresolved findings from the existing deterministic safety engine
- section-level provenance, missingness, timestamps, and stale Blueprint state

Missing records remain `null` or empty collections with `status: "missing"` and a reason. The loader does not infer missing doses, timing, goals, or practice relationships.

## PR 1 implementation plan

### Files

- `src/lib/memberContext.ts`: pure types, grouping, provenance, freshness, goal-source alignment, and practice-link assembly.
- `src/lib/memberContextData.ts`: server-only Supabase loader and existing safety-engine adapter.
- `src/lib/blueprintContext.ts`: backward-compatible optional Blueprint goal field.
- `src/lib/currentBlueprintContext.ts`: populate structured Blueprint goals from the parsed report.
- `src/_tests_/pr108MemberContext.assert.ts`: representative simple, moderate, complex, missing-source, stale, and practice states.
- `src/_tests_/pr108Architecture.assert.mjs`: read-only and boundary assertions.
- `package.json`: focused PR QA command.

### Schema impact

None. The implementation reads existing tables and uses existing server-only service-role access. There is no migration, RLS change, backfill, or new environment variable.

### Migration path

PR 2 can replace Ask LVE360's ad hoc `buildCoachContext` queries with an intent-scoped adapter over this contract. Today, Journey, and weekly synthesis can migrate separately after their current behavior is covered by regression tests.

### Risks and controls

- **Additional read cost when adopted:** the full context queries several existing sources. Consumers should request or cache one snapshot per request instead of rebuilding it repeatedly.
- **Legacy safety quality:** the context exposes current deterministic findings but does not correct rule provenance or unit conversion. Those changes remain isolated to the safety PR.
- **Goal mismatch interpretation:** `different` means exact recorded labels differ; it is not a clinical or semantic judgment that the goals conflict.
- **Historical linkage gaps:** unresolved Blueprint references and absent saved-goal linkage are reported explicitly.

## Explicit non-goals

This PR does not:

- change Ask LVE360 answers, intent classification, or quality scoring
- change Today, Journey, Blueprint, Routine, or reminder UI
- mutate member records
- add a public or client-side context endpoint
- repair safety rules, unit conversions, model routing, or prompt telemetry
- introduce recommendation actions or weekly adaptation

## Rollback

Remove the two new context modules and PR108 tests, remove the Blueprint `goals` field population, and remove the `qa:pr108` script. No database rollback is required.
