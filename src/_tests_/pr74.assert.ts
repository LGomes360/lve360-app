import assert from "node:assert/strict";

import { blueprintSafetyLabel, type CurrentBlueprintContext } from "../lib/blueprintContext.ts";
import {
  isMedicationInstructionAuthority,
  normalizeMedicationRecordInput,
} from "../lib/medicationRecord.ts";

const medication = normalizeMedicationRecordInput({
  name: "  Zepbound  ",
  dose: " 10.0 mg / 0.5 mL ",
  timing: " weekly on Sunday ",
  purpose: " weight management ",
  instruction_authority: "clinician",
});
assert.equal(medication.name, "Zepbound");
assert.equal(medication.dose, "10.0 mg / 0.5 mL");
assert.equal(medication.timing, "weekly on Sunday");
assert.equal(medication.instruction_authority, "clinician");
assert.equal(isMedicationInstructionAuthority("medication_label"), true);
assert.equal(isMedicationInstructionAuthority("lve360"), false);
assert.throws(
  () => normalizeMedicationRecordInput({ name: "Zepbound", instruction_authority: "lve360" }),
  /medication_instruction_source_required/,
);

const context: CurrentBlueprintContext = {
  stack_id: "stack",
  created_at: "2026-08-01T12:00:00.000Z",
  safety_status: "safe",
  safety_acknowledged: false,
  needs_refresh: true,
  priorities: [],
};
assert.equal(blueprintSafetyLabel(context), "Review after your recent changes");
assert.equal(
  blueprintSafetyLabel({ ...context, needs_refresh: false }),
  "No material safety flags identified",
);

console.log("PR74 behavior assertions passed.");
