import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const migration = read("supabase/migrations/20260801212917_pr77_supplement_product_cards.sql");
assert.match(migration, /add column if not exists brand text/i);
assert.match(migration, /add column if not exists reorder_url text/i);
assert.match(migration, /assets\[\.\]fullscript\[\.\]io/i, "Only the trusted catalog image host should be persisted.");
assert.match(migration, /item_kind in \('supplement', 'endocrine_active_supplement'\)/i, "Product metadata must stay supplement-only.");

const routine = read("app/(app)/routine/RoutineClient.tsx");
for (const label of ["Today", "Medications", "Hormones", "Supplements"]) {
  assert.match(routine, new RegExp(`label: "${label}"`), `Routine needs a ${label} view.`);
}
assert.match(routine, /Edit supplement details/);
assert.match(routine, /Open product or reorder link/);
assert.match(routine, /Product image not available/);
assert.match(routine, /Hormone-active supplement/);
assert.match(routine, /type="url"/);
assert.match(routine, /nofollow sponsored/);
assert.match(routine, /Print clinician list/, "PR76 print access must remain available.");
assert.match(routine, /TodayDoses/, "PR76 dose recording must remain available.");

const updateRoute = read("app/api/stacks/update/route.ts");
assert.match(updateRoute, /product_details_supplements_only/);
assert.match(updateRoute, /normalizeHttpsUrl\(reorderUrl\)/);
assert.match(updateRoute, /eq\("user_id", entitlement\.user\.id\)/, "Product edits must remain owner scoped.");

const printPage = read("app/(app)/routine/print/page.tsx");
assert.match(printPage, /Brand:/, "The clinician printout should carry the recorded supplement brand.");

console.log("PR77 Routine workspace assertions passed");
