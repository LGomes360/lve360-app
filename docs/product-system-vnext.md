# LVE360 Product System vNext contract

## Purpose

This document is the implementation boundary for the next LVE360 development program. It reconciles the existing product with the approved direction: health plan continuity and follow-through.

PR147 changes no member-facing behavior, navigation, database schema, or production data. It defines the contract that PR148 through PR162 must follow.

The machine-readable companion is `docs/product-system-vnext.contract.json`.

## Product thesis

LVE360 should keep a member's baseline, current plan, confirmed changes, daily follow-through, observations, and next decision connected.

The internal shorthand is Personal Health Change OS. That is an architecture concept, not member-facing language. The consumer promise should stay simple: LVE360 helps a member keep their health plan current, follow through, and know what to review next.

The core loop is:

1. Establish the baseline.
2. Maintain the current Plan.
3. Confirm a meaningful change.
4. Help the member follow through today.
5. Capture observations without claiming causation.
6. Help the member make the next review decision.
7. Update the Plan and repeat.

## Current and target information architecture

### Current paid navigation

| Surface | Current route | Current job |
| --- | --- | --- |
| Today | `/today` | Daily check-in, action, intention, regimen summary, and supporting insight |
| Routine | `/routine` | Medication, hormone, supplement, schedule, and completion management |
| Journey | `/journey` | Trends, weekly review, and historical learning |
| Blueprints | `/blueprints` | Blueprint versions, PDF access, safety review, and recommendation decisions |
| Settings | `/settings` | Profile, reminders, billing, privacy, export, and deletion |

### Target paid navigation

| Surface | Target route | Contracted job |
| --- | --- | --- |
| Today | `/today` | One clear daily priority, why it matters, and the smallest useful action |
| Plan | `/plan` | Canonical current focus, practices, regimen, schedule, reminders, priorities, and safety state |
| Journey | `/journey` | Confirmed changes, follow-through, observations, uncertainty, and next review decision |

Ask LVE360 remains globally available. Settings remains a utility. Blueprint remains the free delivered product and a dated archive for paid members. Change History is detail inside Plan and Journey, not another primary destination.

### Compatibility rules

1. Do not remove `/routine` until Plan provides equivalent regimen and schedule controls.
2. Do not remove `/blueprints`. It remains the free baseline and paid historical archive.
3. Preserve the current authenticated redirects in `src/lib/authenticatedNavigation.ts`.
4. Do not introduce `/plan` until its reads and member mutation paths pass PR148 interaction integrity.
5. Do not redirect a route until its destination supports the same member task.

## Surface responsibility contract

### Today

Today is an execution surface. It does not duplicate the full regimen, plan editor, Blueprint, or Journey. It shows one primary priority, the reason it was selected, a minimum version, and only relevant supporting actions or exceptions.

### Plan

Plan is authoritative current state. It includes the member's current focus, durable practices, regimen, timing, reminders, health priorities, and canonical safety state. Editing a current-plan item must show exactly what will change before the member confirms it.

### Journey

Journey is the change and learning surface. It distinguishes confirmed facts, member observations, evidence-supported hypotheses, and unknowns. It does not claim that an intervention caused an outcome.

### Ask LVE360

Ask LVE360 explains the current Plan and confirmed history. It may propose a bounded action or prefill a change, but the member must review and confirm any saved mutation. The coach cannot silently change a medication, hormone, supplement, practice, reminder, or saved health record.

### Blueprint

Blueprint is Version Zero: the free baseline and a dated paid archive. It is not the paid member's live Plan. Refreshing a Blueprint creates a new generated artifact and does not silently rewrite current regimen or practice state.

## Data semantics

The system must not use one record type for several meanings.

| Kind | Meaning | Examples | Key rule |
| --- | --- | --- | --- |
| Canonical state | What is true now | Current regimen, active practice, reminder preferences | Only a confirmed mutation updates it |
| Change event | What confirmed plan change happened | Dose updated, supplement paused, practice modified | Append with the state mutation and never rewrite history |
| Execution event | What happened on a date or occurrence | Dose taken, practice completed, check-in saved | Keep separate from plan changes |
| Observation | What the member noticed or measured | Sleep, energy, weight, reflection | Preserve uncertainty and do not imply causation |
| Generated artifact | A dated interpretation | Blueprint, Today brief, weekly synthesis, coach answer | Preserve provenance and never silently promote it to canonical state |
| Product analytics | How the workflow performed | Page view, checkout start, mutation error | Never use it as health or execution truth |

## Member interaction contract

Every member-facing mutation must have five visible states: idle, submitting, success, recoverable error, and terminal error.

Every implementation PR must satisfy these rules:

1. The control describes what it will do.
2. Submission prevents accidental duplicate submission while progress remains visible.
3. Success names what changed and exposes the updated state.
4. Failure names what remained unchanged and offers a safe retry or next step.
5. Health-plan changes require explicit confirmation.
6. Destructive actions name the affected record before confirmation.
7. A retry cannot create duplicate canonical records, execution events, or change events.
8. AI may propose or prefill a change but cannot silently submit it.
9. Safety-sensitive regimen changes trigger the canonical safety workflow when PR158 implements it.
10. Confirmed plan changes retain actor and source provenance when PR151 implements the ledger.

The complete route inventory is maintained in the machine-readable contract. PR148 will audit the current UI and server behavior against this target contract before the Plan redesign starts.

## Lightweight plan-change ledger decision

PR151 will add a small append-only ledger rather than a comprehensive health-change state machine.

### Initial scope

- Confirmed medication, hormone, and supplement changes made through existing regimen controls.
- Confirmed durable-practice changes and weekly adaptation decisions.

### Authoritative state

The current regimen remains authoritative for regimen state. The durable practice entity introduced by PR149 remains authoritative for active practice state. The ledger explains how the current state changed. It does not replace the current state.

### Required event envelope

Each event needs an ID, member ID, domain, entity type and ID, action, before and after values, source type and label, optional reason, effective date, actor type, request ID, and creation time.

### Invariants

1. Append the event in the same transaction as the confirmed state mutation.
2. Events are immutable. A correction creates a later event.
3. Dose completions, daily check-ins, observations, generated content, and product analytics stay out of this ledger.
4. AI may structure a proposal but cannot confirm or write the event.
5. Member RLS, account export, and account deletion include ledger records.
6. The first release is limited to regimen and practice changes.

## Sequencing and gates

Development proceeds in actual GitHub order from PR147 through PR162. PR147 is documentation and contract only. PR148 verifies interaction integrity. PR149 and PR150 create and reconcile durable practices. PR151 introduces the bounded ledger. Only then should the product reshape Today, Plan, Journey, Blueprint, safety, coaching, personalization, and notifications.

External beta recruitment is not part of this sequence. The founder gate follows PR162 and requires two complete founder weekly cycles without P0 or P1 defects, passing 24-persona regression coverage, accurate before-and-after capture, no silent health-record changes, and passing security, export, deletion, notification, browser, and cost checks.

## Explicit non-goals

- No runtime or schema changes in PR147.
- No full health-change aggregate or state machine.
- No EHR, wearable, or laboratory integrations before the founder gate.
- No clinician portal, provider messaging, appointment system, or manual clinical service.
- No automatic diagnosis, prescribing, dose changes, or causal claims.
- No developer terminology in the member interface.
- No external recruitment before the founder go or no-go decision.
