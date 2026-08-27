import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const today = read("app/(app)/routine/TodayDoses.tsx");
const summary = read("src/components/dashboard/TodaysPlan.tsx");
const workspace = read("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx");
const context = read("src/components/dashboard/TodayExperience.tsx");
const todaySurface = read("src/lib/todaySurface.ts");
const migration = read("supabase/migrations/20260808212539_pr83_safety_acknowledgement.sql");

assert.match(today, /groupByDaypart/);
assert.match(today, /Mark \$\{available\.length\} available taken/);
assert.match(today, /onEditSchedule\(item\)/);
assert.match(summary, /href="\/routine#routine-ideas"/);
assert.match(summary, /href="\/routine#schedule-review"/);
assert.match(workspace, /I have reviewed these safety notes/);
assert.match(workspace, /const sectionId = isSafety[\s\S]*\? "safety-notes"/);
assert.match(todaySurface, /!blueprint\.safety_acknowledged/);
assert.match(migration, /safety_acknowledged_at timestamptz/);

console.log("PR83 page assertions passed.");
