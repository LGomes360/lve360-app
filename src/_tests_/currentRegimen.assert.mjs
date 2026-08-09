import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const migration = read("supabase/migrations/20260801172222_canonical_current_regimen.sql");
assert.match(migration, /create table if not exists public\.current_regimen_items/i, "PR72 needs a canonical regimen table.");
assert.match(migration, /item_kind in \('medication', 'supplement', 'hormone', 'endocrine_active_supplement'\)/i, "Every regimen item must retain an explicit type.");
assert.match(migration, /instruction_source in \('intake', 'member_update', 'adopted_recommendation', 'manual_add'\)/i, "Every instruction needs provenance.");
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i, "Regimen rows must be owner-isolated with RLS.");
assert.match(migration, /intake_events_user_regimen_date_key/i, "Adherence must use stable regimen IDs.");
const writePrivileges = read("supabase/migrations/20260801182000_server_control_current_regimen_writes.sql");
assert.match(writePrivileges, /revoke update[^;]*from authenticated/i, "Member regimen writes must remain server-controlled.");

const combined = read("app/api/stacks/combined/route.ts");
assert.match(combined, /getRoutineData/, "Today must read the canonical routine data service.");
const routineData = read("src/lib/routineData.ts");
const recommendationData = read("src/lib/recommendationDecisionData.ts");
assert.match(routineData, /getCurrentRegimen/, "Routine data must read the canonical current regimen.");
assert.match(routineData, /getStackRecommendationDecisions\([\s\S]*latestStack\.id/, "Only the newest Blueprint may provide proposals.");
assert.match(recommendationData, /\.eq\("stack_id", stackId\)/, "Recommendation loading must remain scoped to the selected Blueprint.");
assert.match(recommendationData, /\.eq\("is_current", false\)/, "Blueprint recommendations must remain proposals until adopted.");
assert.doesNotMatch(routineData, /\.eq\("user_id", userId\)[\s\S]*\.eq\("is_current", true\)/, "Historical current flags must not drive Today.");

const supplements = read("app/api/blueprints/[stackId]/supplements/route.ts");
assert.match(supplements, /replaceCurrentSupplements/, "Blueprint updates must replace the current supplement regimen.");
assert.match(supplements, /blueprintInputSnapshotHash\(updated, regimenToLedger\(currentRegimen\)\)/, "Saved regimen changes must make the current Blueprint stale.");

const generator = read("src/lib/generateStack.ts");
assert.match(generator, /ensureCurrentRegimen\(user_id, id, sub\)/, "Safety refreshes must use the newest canonical regimen.");
assert.match(generator, /blueprintInputSnapshotHash\(sub, currentStackLedger\)/, "Generated Blueprint versions must hash the regimen they reviewed.");

const activate = read("app/api/stack-items/activate/route.ts");
assert.match(activate, /adoptStackRecommendation/, "A proposal must require explicit adoption.");
assert.doesNotMatch(activate, /stacks_items[\s\S]*is_current:\s*true/, "Adoption must not rewrite historical Blueprint rows.");

const updateRoute = read("app/api/stacks/update/route.ts");
assert.match(updateRoute, /getSupabaseAdmin/, "Regimen updates must use the owner-bound server route.");

const today = read("src/components/dashboard/TodaysPlan.tsx");
assert.match(today, /fetch\("\/api\/stacks\/combined"/, "Today must load its summary from the canonical combined endpoint.");
assert.match(today, /href="\/routine"/, "Today must hand detailed regimen work off to Routine.");
assert.doesNotMatch(today, /\/api\/intake\/set/, "The compact Today summary must not retain inline regimen tracking controls.");

const model = read("src/lib/currentRegimenModel.ts");
assert.match(model, /purpose: item\.purpose \?\? null/, "Regimen normalization must preserve purpose.");
assert.match(model, /dose: item\.dose \?\? null/, "Regimen normalization must preserve dose.");
assert.match(model, /timing: item\.timing \?\? null/, "Regimen normalization must preserve timing.");

const intakeFixture = read("src/_tests_/normalizedCurrentStackLedger.assert.ts");
assert.match(intakeFixture, /Magnesium Threonate/, "Fixtures must cover the supplement update that previously went stale.");
assert.match(intakeFixture, /Monday and Thursday evenings/, "Fixtures must preserve free-text timing instructions.");
assert.match(intakeFixture, /Testosterone cypionate/, "Fixtures must cover a distinct hormone type.");
assert.match(intakeFixture, /Medication 2/, "Fixtures must cover repeated Tally medication groups.");

console.log("Current regimen assertions passed.");
