# LVE360 24-persona regression harness

## Purpose

The permanent persona harness checks whether LVE360's deterministic product logic stays coherent as a member's context changes over several weeks. It is a release guardrail for product-learning, safety, continuity, accessibility, and routine-timing behavior.

Run it with:

```bash
npm run qa:personas
```

The command uses no production account, database, secret, network request, or live AI generation.
It runs on Node 22, which is also used by the repository's CI workflow and supports the existing stripped-TypeScript QA commands.

## Coverage

The suite runs exactly 24 synthetic personas through four weeks each, producing 96 persona-weeks. The matrix includes:

- Every LVE identity direction: movement, nutrition, sleep, emotional health, relationships, focus, career, happiness, and overall health.
- Adults from 18-34 through 70+.
- Low, moderate, and high technical confidence.
- No regimen, supplement-only routines, daily medication timing, multiple daily times, and mixed medication, hormone, and supplement routines.
- Accessibility and burden-reduction needs such as screen readers, large text, large targets, keyboard navigation, reduced distraction, variable schedules, plain language, and low cognitive load.
- Goals spanning longevity, vitality, energy, and happiness.

Each persona experiences the same required product states with persona-specific goals, practices, cues, minimum versions, and reflections:

1. Activation and an initial check-in.
2. A lower-capacity week that should select the saved minimum version.
3. A gap followed by a neutral weekly review.
4. Changed context that should inform later intentions and weekly learning without rewriting history.

## What it asserts

- Daily intentions remain valid identity statements and explain which saved context supports them.
- Member-reported reflections are normalized, bounded, attributed, and never treated as causal or clinical facts.
- Today preserves the saved practice, selects the minimum version on lower-capacity days, and uses nonjudgmental return language.
- Weekly learning shows recorded evidence, considers prior weeks, and avoids diagnosis or clinical direction.
- Routine timing separates earlier unrecorded occurrences from the next upcoming occurrence and excludes future items from bulk completion.
- Source persona fixtures remain immutable.

Failures include the persona ID, week, scenario, invariant, and explanation so the responsible product path can be found quickly.

## Evidence boundary

This harness does not prove customer conversion, retention, willingness to pay, clinical effectiveness, or real-world health outcomes. Synthetic personas cannot replace authenticated member QA or external beta feedback. They provide broad, repeatable regression coverage between those higher-value evaluations.
