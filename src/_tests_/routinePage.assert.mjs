import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const navigation = read("src/lib/authenticatedNavigation.ts");
assert.match(navigation, /href: "\/routine", label: "Routine"/, "Paid member navigation must include Routine.");

const page = read("app/(app)/routine/page.tsx");
assert.match(page, /requireTier\(\["premium", "trial"\]/, "Routine must require paid or trial access.");
assert.match(page, /getRoutineData\(user\.id\)/, "Routine must render the canonical regimen on the server.");

const data = read("src/lib/routineData.ts");
assert.match(data, /item_kind: item\.item_kind/, "Current items must use their persisted type.");
assert.match(data, /\.eq\("is_current", false\)/, "Only unadopted Blueprint rows may appear as proposals.");
assert.match(data, /source_type: "blueprint_proposal"/, "Proposals need an explicit non-current source type.");

const client = read("app/(app)/routine/RoutineClient.tsx");
const routineModel = read("src/lib/routine.ts");
assert.match(routineModel, /medication: "Prescriptions"/, "Routine must separate prescriptions.");
assert.match(routineModel, /hormone: "Hormones"/, "Routine must separate hormones.");
assert.match(routineModel, /supplement: "Supplements"/, "Routine must separate supplements.");
assert.match(routineModel, /endocrine_active_supplement: "Hormone-active items"/, "Routine must separate hormone-active items.");
assert.match(client, /Ideas to consider/, "Routine must separate proposed ideas.");
assert.match(client, /Dose cannot be changed here/, "Prescription and hormone dose changes must be unavailable.");
assert.match(client, /Schedule not recorded/, "Missing schedules must be stated plainly.");
assert.match(client, /RotateCcw[\s\S]*Undo/, "State changes must expose text and icon Undo.");
assert.match(client, /min-h-12/, "Primary mobile controls must use large tap targets.");
assert.match(routineModel, /source_type === "blueprint_proposal"/, "Proposal grouping must not depend on historical current flags.");
const updateRoute = read("app/api/stacks/update/route.ts");
assert.match(updateRoute, /dose_updates_unavailable_for_prescriptions_and_hormones/, "Protected dose edits must also be rejected by the API.");

const today = read("app/(app)/today/TodayClient.tsx");
assert.doesNotMatch(today, /Disclosure|details|summary/, "Today must not retain the collapsed regimen manager.");
const todaySummary = read("src/components/dashboard/TodaysPlan.tsx");
assert.match(todaySummary, /Open Routine/, "Today must link its compact summary to Routine.");
assert.match(todaySummary, /Due today/, "Today must show a compact due summary.");
assert.match(todaySummary, /Need a schedule/, "Today must show schedule review needs.");

console.log("Routine page assertions passed.");
