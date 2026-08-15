# LVE360 Safety Integrity

PR111 makes the deterministic safety layer unit-aware, evidence-grounded, and auditable. It remains educational wellness support and does not diagnose, prescribe, or instruct a member to change medication or hormone treatment.

## Rule provenance

Every interaction and rule can record:

- source label, URL, and source type
- source or label date and LVE360 review date
- exact ingredient or formulation assessed
- proposed interaction mechanism
- severity rationale and confidence
- member-facing qualification
- rule version and review status

Legacy rows remain in place with `provenance_status = unreviewed`, `confidence = unknown`, and `rule_version = legacy-v1` until they are curated. Missing evidence is shown as missing rather than inferred.

The migration also adds the `updated_at` column expected by the pre-existing update triggers on both safety tables. This repairs the prior trigger/schema mismatch and preserves automatic audit timestamps.

## Dose comparison

The engine safely normalizes mass units across mcg, mg, and g. Vitamin D also supports the authoritative conversion of 1 mcg to 40 IU. A recorded 5,000 IU dose therefore compares as 125 mcg against the 100 mcg adult upper-intake threshold. Unsupported units are never guessed; the member receives a review note asking them to confirm the label.

## Thyroid-medication review

- Plain Vitamin D3 no longer creates a general thyroid-spacing warning.
- A Lactobacillus/Bifidobacterium probiotic blend no longer creates a general thyroid-spacing warning. Its separate antibiotic and immune-context cautions remain available.
- Magnesium remains a timing-review item. The evidence qualification explains that direct trial evidence studied citrate and aspartate formulations, so exact product guidance should come from the prescription label or pharmacist.
- The engine does not invent a four-hour interval when a rule has no interval.
- A specific ingredient finding suppresses a duplicate generic spacing message.

## Clinician-directed regimens

A proposed dose above a structured upper-intake threshold remains blocked pending review. A current dose explicitly recorded as clinician- or pharmacist-directed becomes a review finding instead. The message tells the member to confirm total intake, rationale, and monitoring with the overseeing professional and not to change the regimen from the app warning alone.

## Member-facing explanation

Each finding now identifies urgency, what to do, why it appeared, evidence source, confidence, rule version, and important uncertainty. Ask LVE360 receives the same evidence metadata for deterministic safety answers.

## Verification

Run:

```powershell
npm.cmd run qa:safety-engine
npm.cmd run qa:pr111
npm.cmd run typecheck
npm.cmd run build
```
