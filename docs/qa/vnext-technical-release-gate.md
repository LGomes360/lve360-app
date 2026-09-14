# vNext technical release gate (PR179)

Run `npm run qa:release` with Node 22. The runner expands the named QA suites,
deduplicates commands, and invokes the current Node executable directly without
nested npm shells. Every check runs even after a failure. Nonzero exits, timeouts,
and launch errors fail the automated gate. CI retains `artifacts/release-gate.json`.
The report contains check names and statuses, not profile data or model responses.

## Automated evidence

The gate includes PR178's current coach, personalization, reminder, private access,
and analytics chain; PR162's canonical safety and intent checks; PR161's Plan,
Journey, Blueprint and practice continuity checks; privacy/legal contracts; and
the permanent 24-persona harness. Many architecture assertions inspect source:
they are not evidence that production authorization or email delivery works.
Existing individual QA scripts remain available. Typecheck and build are separate.

## Required live evidence

Record deployment SHA, date, result and evidence for each item. Never copy tokens
or private health records into CI artifacts. Pending is not a pass.

| Gate | Evidence required | Current status |
| --- | --- | --- |
| Private access | Public Blueprint accessible; dashboard denied to uninvited account; invited member and founder flows pass | Pending current release run |
| Confirmed changes | Practice and regimen before/after; cancel leaves state unchanged; Plan and Journey agree | Pending current release run |
| Coach | Grounded answers; failed generation does not invent success or silently mutate records | Pending current release run |
| Reminders | Timing, timezone and quiet-hour changes; scheduler, delivery and deduplicated ledger agree | Pending current release run |
| Privacy and safety | Cross-account denial, export/delete rehearsal, current safety state after changes | Pending current release run |
| Founder value | Two complete weekly cycles; no unresolved P0/P1; clear Today action and useful learning | Pending founder evidence |
| Operating costs | Observed AI usage and costs compared with the agreed private-beta ceiling | Pending measured evidence |

## Decision and rollback

### Initial run, September 13, 2026

59 of 61 automated checks passed, including the 24-persona harness. Two existing
coach assertions fail on the same request: "I slept poorly last night. How should
I adjust tomorrow without changing my medications or supplements?" The router
returns REQUEST_TO_CHANGE_RECORD instead of BEHAVIORAL_COACHING. Its broad mutation
pattern crosses the "without changing" clause. No evidence of an actual persisted
mutation was found in this local run. Preserve these assertions; this is a release
blocker for focused routing correction and authenticated regression testing.

Follow-up: clause-scoped mutation matching now keeps preservation language out of
the mutation detector, while affirmative requests in mixed prompts still enter
confirmation. All 61 checks pass, including unchanged PR109/PR110 expectations,
new negation/mixed-request/emergency cases, and the 24-persona harness. Typecheck
passes. Authenticated Preview verification remains pending.

The migration-history test now preserves its historical prefix while allowing
later migrations. This does not assert that remote migration versions match.

Automated success means only that automated checks passed. It never authorizes
public signup, public pricing, public checkout, a Stripe live cutover, or a claim
of validated retention. Luke remains the founder decision owner. Link any P0/P1
finding to a bounded follow-up PR before declaring the gate complete.

This PR changes test tooling, CI and coach request classification. It does not
change record-write authorization or require a migration. Revert the PR to
restore the previous runner and routing; no data rollback is needed.
