import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const contextService = read("src/lib/currentBlueprintContext.ts");
assert.match(contextService, /order\("created_at", \{ ascending: false \}\)/, "Current Blueprint must be the newest version.");
assert.match(contextService, /blueprintInputSnapshotHash/, "Blueprint context must compare the canonical regimen snapshot.");
assert.match(contextService, /deriveBlueprintSafetyStatus/, "Safety state must come from the visible current Blueprint.");
assert.match(contextService, /needs_review: experiment\.status === "active"/, "An affected active practice must be flagged for review without mutation.");

const todayPage = read("app/(app)/today/page.tsx");
const today = read("src/components/dashboard/TodayExperience.tsx");
assert.match(todayPage, /getCurrentBlueprintContext/, "Today must load the shared current Blueprint context.");
assert.doesNotMatch(todayPage, /stacks_items[\s\S]*clinician review/, "Today must not infer safety from item note text.");
assert.match(today, /Current priorities/, "Today must show current Blueprint priorities.");
assert.match(today, /This focused week came from:/, "Today must show the source Blueprint action.");
assert.match(today, /Your active practice has not been overwritten/, "Today must preserve practices after a Blueprint refresh.");
assert.match(today, /blueprints\/\$\{blueprint\.stack_id\}/, "Today safety notices must link to the exact Blueprint.");

const journeyRoute = read("app/api/journey/route.ts");
const journey = read("src/components/journey/JourneyDashboard.tsx");
assert.match(journeyRoute, /source_stack_id, source_action_id/, "Journey must load Blueprint provenance for every practice.");
assert.match(journeyRoute, /experiment_blueprints: experimentBlueprints/, "Journey must return resolved Blueprint links.");
assert.match(journey, /Supports Blueprint priority:/, "Journey must name the priority each practice supports.");
assert.match(journey, /was preserved and was not automatically changed/, "Journey must explain that refreshed Blueprints do not overwrite practices.");
assert.match(journey, /Review only\. This cannot become a practice/, "Safety-sensitive actions must remain review-only.");

const medicationRoute = read("app/api/routine/medications/route.ts");
const updateRoute = read("app/api/stacks/update/route.ts");
const routine = read("app/(app)/routine/RoutineClient.tsx");
const migration = read("supabase/migrations/20260801182027_pr74_medication_instruction_authority.sql");
assert.match(medicationRoute, /normalizeMedicationRecordInput/, "New medications must use the strict provenance validator.");
assert.match(medicationRoute, /upsertReportedMedication/, "New medications must enter the canonical regimen.");
assert.match(updateRoute, /medication_instruction_source_required/, "Medication updates must require provenance.");
assert.match(updateRoute, /existing\.item_kind === "hormone"/, "Hormone dose edits must remain blocked.");
assert.match(routine, /Add a prescribed medication/, "Routine must let members add a new medication.");
assert.match(routine, /LVE360 is not advising you to discontinue it/, "Stop tracking must not imply discontinuation advice.");
assert.match(routine, /Review your Blueprint after this change/, "Medication changes must point members back to Blueprint review.");
assert.match(migration, /instruction_authority in \('clinician', 'pharmacist', 'medication_label'\)/, "Medication provenance must be constrained in Postgres.");

console.log("PR74 page and safety assertions passed.");
