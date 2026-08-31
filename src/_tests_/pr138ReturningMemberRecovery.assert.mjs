import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const packageJson = JSON.parse(read("package.json"));
const supplementSearch = read("app/api/fullscript/search/route.ts");
const routine = read("app/(app)/routine/RoutineClient.tsx");
const blueprintRefresh = read("app/api/blueprints/[stackId]/refresh/route.ts");
const migration = read("supabase/migrations/20260827215843_pr138_repeat_blueprint_snapshots.sql");

assert.match(packageJson.scripts["qa:pr138"], /pr138ReturningMemberRecovery\.assert\.mjs/);

assert.match(supplementSearch, /if \(!items\.length\) items = await fallbackSearch\(q\)/,
  "An empty vendor response must fall back to the internal catalog.");
assert.match(supplementSearch, /ilike\("product_name", `%\$\{q\}%`\)/,
  "The internal catalog must search the product name as well as the ingredient.");

assert.match(routine, /Add a supplement manually/);
assert.match(routine, /vendor: "member"/);
assert.match(routine, /No catalog match was found\. You can still record the supplement manually below\./);
for (const label of ["Add for morning", "Add for evening", "Add morning and evening"]) {
  assert.match(routine, new RegExp(label));
}

assert.match(blueprintRefresh, /cloneBlueprintVersion/);
assert.match(blueprintRefresh, /generation_reason: "member-refresh-reused"/);
assert.match(blueprintRefresh, /safety_acknowledged_at: null/);
assert.match(blueprintRefresh, /snapshot_occurrence: nextOccurrence/);
assert.match(blueprintRefresh, /from\("stacks_items"\)[\s\S]*stack_id: clonedStackId/,
  "A repeated Blueprint version must preserve its materialized report items.");
assert.doesNotMatch(blueprintRefresh, /stack_id: existing\.id, reused: true/,
  "A refresh must never redirect the member back to an older exact-hash row.");

assert.match(migration, /add column if not exists snapshot_occurrence integer not null default 1/);
assert.match(migration, /drop index if exists public\.stacks_submission_snapshot_key/);
assert.match(migration, /create unique index if not exists stacks_submission_snapshot_occurrence_key/);
assert.match(migration, /submission_id, input_snapshot_hash, snapshot_occurrence/);
assert.match(migration, /Rollback notes/);

console.log("PR138 returning-member recovery assertions passed.");
