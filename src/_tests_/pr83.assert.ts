import assert from "node:assert/strict";

import { blueprintSafetyLabel, type CurrentBlueprintContext } from "../lib/blueprintContext.ts";
import { regimenDoseDaypart } from "../lib/regimenDose.ts";

const warning: CurrentBlueprintContext = {
  stack_id: "stack-83",
  created_at: "2026-08-08T12:00:00.000Z",
  safety_status: "warning",
  safety_acknowledged: false,
  needs_refresh: false,
  priorities: [],
};

assert.equal(blueprintSafetyLabel(warning), "Safety notes need your attention");
assert.equal(blueprintSafetyLabel({ ...warning, safety_acknowledged: true }), "Safety notes reviewed");
assert.equal(
  blueprintSafetyLabel({ ...warning, safety_acknowledged: true, needs_refresh: true }),
  "Review after your recent changes",
  "A new input change must take priority over an older acknowledgement",
);

assert.equal(regimenDoseDaypart("06:30"), "Morning");
assert.equal(regimenDoseDaypart("12:00"), "Afternoon");
assert.equal(regimenDoseDaypart("16:59"), "Afternoon");
assert.equal(regimenDoseDaypart("17:00"), "Evening");

console.log("PR83 behavior assertions passed.");
