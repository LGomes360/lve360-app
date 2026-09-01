import assert from "node:assert/strict";

import { blueprintSafetyLabel, type CurrentBlueprintContext } from "../lib/blueprintContext.ts";
import { regimenDoseDaypart } from "../lib/regimenDose.ts";
import { deriveCanonicalSafetyState } from "../lib/safetyState.ts";

const warning: CurrentBlueprintContext = {
  stack_id: "stack-83",
  created_at: "2026-08-08T12:00:00.000Z",
  safety_status: "warning",
  safety_acknowledged: false,
  needs_refresh: false,
  safety: deriveCanonicalSafetyState({
    stackId: "stack-83",
    stackCreatedAt: "2026-08-08T12:00:00.000Z",
    reportStatus: "warning",
  }),
  priorities: [],
};

assert.equal(blueprintSafetyLabel(warning), "Safety notes need review");
const acknowledgedSafety = deriveCanonicalSafetyState({
  stackId: warning.stack_id,
  stackCreatedAt: warning.created_at,
  reportStatus: "warning",
  acknowledgedAt: "2026-08-08T13:00:00.000Z",
});
assert.equal(blueprintSafetyLabel({ ...warning, safety_acknowledged: true, safety: acknowledgedSafety }), "Safety notes reviewed");
assert.equal(
  blueprintSafetyLabel({ ...warning, safety_acknowledged: true, needs_refresh: true, safety: acknowledgedSafety }),
  "Safety notes reviewed",
  "A broad Blueprint refresh flag must not override a still-current safety acknowledgement",
);

assert.equal(regimenDoseDaypart("06:30"), "Morning");
assert.equal(regimenDoseDaypart("12:00"), "Afternoon");
assert.equal(regimenDoseDaypart("16:59"), "Afternoon");
assert.equal(regimenDoseDaypart("17:00"), "Evening");

console.log("PR83 behavior assertions passed.");
