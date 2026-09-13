# Ask LVE360 Coach Reliability Gate

PR174 makes the canonical Plan and its confirmed change history available to Ask LVE360 through a read-only path.

## Runtime contract

- Current Plan questions resolve deterministically from canonical member context.
- Confirmed history comes only from the append-only `plan_change_events` ledger.
- The answer identifies current focus, active practice, saved goals, Routine counts, safety status, and recent confirmed changes when available.
- The visible grounding card links to Plan and its confirmed history.
- Generated coaching is not described as a confirmed change unless the member reviewed and confirmed it.
- Ask LVE360 does not insert, update, delete, or upsert Plan history.

## Quality threshold

The executable PR174 gate requires every covered current-state and history scenario to achieve:

- 100% task-success pass rate;
- 100% factual coverage;
- both canonical source IDs;
- an explicit saved-record limitation;
- an explicit read-only boundary; and
- a safe next step.

The gate covers a populated Plan, confirmed history, empty history, and a mutation attempt that must remain outside the read-only lookup path.

## Database impact

No migration is required. PR174 reads the existing append-only ledger through the server-side member-context loader and preserves its Row Level Security and privilege model.
