import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const regimenModel = read("src/lib/currentRegimenModel.ts");
const routine = read("src/lib/routine.ts");
const blueprintPage = read("app/(app)/blueprints/[stackId]/page.tsx");
const blueprintClient = read("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx");
const updateRoute = read("app/api/stacks/update/route.ts");
const supplementRoute = read("app/api/blueprints/[stackId]/supplements/route.ts");
const routineClient = read("app/(app)/routine/RoutineClient.tsx");
const printPage = read("app/(app)/routine/print/page.tsx");

assert.match(regimenModel, /canonicalRegimenTiming\(item\)/, "Blueprint refresh inputs must use canonical timing.");
assert.match(blueprintPage, /timing: canonicalRegimenTiming\(item\)/, "Current Blueprint supplements must use canonical timing.");
assert.match(routine, /scheduleReview: current\.filter\(\(item\) => !item\.schedule\)/, "Today and Routine must share the structured-schedule rule.");
assert.match(updateRoute, /dose_confirmation_required/, "Suspicious dose edits need explicit confirmation.");
assert.match(supplementRoute, /invalid_supplement_dose/, "Blueprint supplement edits must reject suspicious units.");
assert.match(routineClient, /I checked the amount and unit/, "Routine must expose a member confirmation step.");
assert.match(blueprintClient, /Manage checklist timing and cadence in/, "Blueprint timing edits must hand off to the canonical Routine schedule.");
assert.match(printPage, /Member confirmation needed/, "Clinician export must not silently present a suspicious dose.");

console.log("PR84 page assertions passed.");
