# ChatGPT Health to LVE360 handoff

## Product decision

ChatGPT Health is the analysis surface. LVE360 is the continuity and follow-through surface.

LVE360 does not attempt to duplicate Apple Health ingestion, medical-record browsing, or broad health analysis. A member reviews a bounded summary in ChatGPT, explicitly approves the handoff, and LVE360 stores only the approved summary needed to shape a daily focus and preserve learning over time.

## UI map

### 1. ChatGPT Health: understand and approve

The member asks ChatGPT Health to review a specific time window across four areas:

- Sleep: duration, consistency, and member-described quality.
- Exercise: movement and workouts without treating daily totals as a grade.
- Diet and weight: weight trend plus eating context the member chooses to share. Diet quality must never be inferred from weight.
- Overall feeling: energy, stress, mood, and emotional wellbeing only as the member describes them.

ChatGPT presents a compact four-area summary, the source window, missing context, and one proposed focus. Nothing is sent to LVE360 until the member approves the exact summary.

### 2. LVE360 Today: one health picture, then one priority

Today keeps its listening-first order:

1. Set an optional intention.
2. Complete or skip the member-reported check-in.
3. Review the four-area health picture.
4. See one priority grounded in the saved Plan.
5. Complete the practice and routine actions.

The health picture distinguishes `Measured + reported`, `Connected data`, `Reported today`, and `Needs context`. It does not create a composite wellness score.

### 3. LVE360 Settings: permission and correction

Settings explains the four areas, what leaves ChatGPT, what LVE360 stores, and what remains out of scope. The member can review connection status, last approved handoff, permitted areas, and deletion controls after the MCP connection is implemented.

### 4. LVE360 Journey: longitudinal learning

Journey will show weekly patterns only after the direct handoff is validated. It should connect changes in the four areas to the member’s saved practice without claiming causation.

## Bounded handoff contract

The future authenticated MCP write tool should accept one member-approved snapshot:

```json
{
  "snapshot_date": "YYYY-MM-DD",
  "source_window": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "areas": {
    "sleep": { "summary": "...", "data_completeness": "..." },
    "exercise": { "summary": "...", "data_completeness": "..." },
    "diet_weight": { "summary": "...", "data_completeness": "..." },
    "overall_feeling": { "summary": "...", "data_completeness": "..." }
  },
  "proposed_focus": "...",
  "member_approved": true
}
```

The tool must reject raw records, raw HealthKit samples, diagnoses, medication changes, inferred mental-health states, and any handoff that is not explicitly member-approved.

## Delivery sequence

1. This PR: UI contract and Today/Settings surfaces using the existing bounded connected-health and member check-in data.
2. Next PR: authenticated LVE360 MCP tools and account linking, with a private founder-only rollout.
3. Validation: confirm ChatGPT Health can use the Health context and invoke the LVE360 tool in one member-approved flow.
4. Later PR: Journey trends and correction/deletion controls after the handoff is proven.

## Rollback

The UI can be removed without deleting existing Apple Health foundation tables or daily check-ins. No new persistence or external connection is introduced in this phase.
