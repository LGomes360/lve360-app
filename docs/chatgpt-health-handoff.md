# ChatGPT Health to LVE360 handoff

## Product decision

ChatGPT Health is the analysis surface. LVE360 is the continuity and follow-through surface.

LVE360 does not attempt to duplicate Apple Health ingestion, medical-record browsing, or broad health analysis. A member reviews a bounded summary in ChatGPT, explicitly approves the handoff, and LVE360 stores only the approved summary needed to shape a daily focus and preserve learning over time.

## UI map

### 1. ChatGPT Health: understand and approve

The member asks ChatGPT Health to review a specific time window across five areas:

- Sleep: duration, consistency, and member-described quality.
- Exercise: movement and workouts without treating daily totals as a grade.
- Diet and weight: weight trend plus eating context the member chooses to share. Diet quality must never be inferred from weight.
- Overall feeling: energy, stress, mood, and emotional wellbeing only as the member describes them.
- Lab balance: a member-approved trend summary derived from verified lab reports. It must retain collection dates, units, and the source laboratory's reference ranges, and must not diagnose or label the member healthy or unhealthy.

ChatGPT presents a compact five-area summary, the source window, missing context, and one proposed focus. Nothing is sent to LVE360 until the member approves the exact summary.

### 2. LVE360 Today: one health picture, then one priority

Today keeps its listening-first order:

1. Set an optional intention.
2. Complete or skip the member-reported check-in.
3. Review the five-area health picture.
4. See one priority grounded in the saved Plan.
5. Complete the practice and routine actions.

The health picture distinguishes `Measured + reported`, `Connected data`, `Reported today`, and `Needs context`. It does not create a composite wellness score.

### 3. LVE360 Settings: permission and correction

Settings explains the five areas, what leaves ChatGPT, what LVE360 stores, and what remains out of scope. The member can review connection status, last approved handoff, permitted areas, and deletion controls after the MCP connection is implemented.

### 4. LVE360 Journey: longitudinal learning

Journey will show weekly patterns only after the direct handoff is validated. It should connect changes in the five areas to the member’s saved practice without claiming causation.

## Bounded handoff contract

The authenticated MCP write tool accepts one member-approved snapshot:

```json
{
  "snapshot_date": "YYYY-MM-DD",
  "source_window": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "areas": {
    "sleep": { "summary": "...", "data_completeness": "..." },
    "exercise": { "summary": "...", "data_completeness": "..." },
    "diet_weight": { "summary": "...", "data_completeness": "..." },
    "overall_feeling": { "summary": "...", "data_completeness": "...", "member_described": true },
    "lab_balance": {
      "summary": "...",
      "data_completeness": "...",
      "result_window": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
      "measurement_context": "Units and source-laboratory reference ranges retained in the summary.",
      "interpretation_basis": "source_lab_reference_ranges"
    }
  },
  "proposed_focus": "...",
  "member_approved": true
}
```

The tool must reject raw records, raw HealthKit samples, diagnoses, medication changes, inferred mental-health states, lab summaries without dates, units, and source-lab reference ranges, and any handoff that is not explicitly member-approved.

## Private founder-pilot implementation

PR187 adds an authenticated Supabase Edge Function at:

`https://splafvdwllglorcegxam.supabase.co/functions/v1/health-context-mcp`

It uses Supabase OAuth 2.1 with PKCE and user-scoped RLS. The consent page is hosted at `/oauth/consent`, and both the consent UI and MCP function independently require the configured `LVE360_FOUNDER_USER_ID`. The write tool uses a strict schema, requires `member_approved: true`, rejects unrecognized fields, and returns only saved-record metadata so health summaries are not repeated in tool logs.

LVE360 Settings shows the latest approved handoff and provides member-controlled deletion. Today can combine the approved summary with current connected data and the member's own check-in, while keeping the check-in as the source of truth.

Production enablement requires all of the following:

1. Apply the PR187 migration.
2. Use an asymmetric Supabase Auth signing key (ES256 or RS256).
3. Enable the Supabase OAuth 2.1 server and dynamic client registration, with `/oauth/consent` as the authorization path.
4. Set `LVE360_FOUNDER_USER_ID` as a Supabase Edge Function secret.
5. Deploy `health-context-mcp` with gateway JWT verification disabled; the function performs OAuth discovery and token verification itself.
6. Connect the MCP endpoint from ChatGPT, approve the founder consent screen, and exercise status, write, display, and delete.

The code path is complete, but live ChatGPT Health validation remains a release gate. The product must not imply that ChatGPT Health can invoke the tool until this exact production flow succeeds.

## Delivery sequence

1. PR186: UI contract and Today/Settings surfaces using bounded connected-health and member check-in data.
2. PR187: authenticated LVE360 MCP tools, OAuth consent, bounded persistence, Today display, and deletion for a private founder-only rollout.
3. Validation: confirm ChatGPT Health can use Health context and invoke the LVE360 tool in one member-approved flow.
4. Later PR: Journey trends after the handoff is proven over multiple weeks.

## Rollback

Disable or remove the `health-context-mcp` Edge Function to stop new handoffs without affecting Apple Health foundation tables or daily check-ins. Existing summaries remain member-owned and removable from Settings; the PR187 table can be dropped only after those records are intentionally handled.
