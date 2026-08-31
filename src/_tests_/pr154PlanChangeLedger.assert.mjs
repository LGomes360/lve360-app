import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260831040616_pr154_plan_change_ledger.sql");
const regimen = read("src/lib/currentRegimen.ts");
const accountExport = read("app/api/account/export/route.ts");
const accountDelete = read("app/api/account/delete/route.ts");

assert.match(migration, /create table public\.plan_change_events/);
assert.match(migration, /references public\.users\(id\) on update cascade on delete cascade/);
assert.match(migration, /check \(domain in \('regimen', 'practice'\)\)/);
assert.match(migration, /check \(before_state is not null or after_state is not null\)/);
assert.match(migration, /alter table public\.plan_change_events enable row level security/);
assert.match(migration, /grant select on table public\.plan_change_events to authenticated/);
assert.match(migration, /grant select, insert on table public\.plan_change_events to service_role/);
assert.doesNotMatch(migration, /grant[^;]*(?:update|delete)[^;]*plan_change_events/i);
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);

assert.match(migration, /create function public\.record_regimen_plan_change\(\)/);
assert.match(migration, /new\.instruction_source = 'intake'/);
assert.match(migration, /after insert or update on public\.current_regimen_items/);
assert.match(migration, /when old\.active and not new\.active then 'stopped'/);
assert.match(migration, /when not old\.active and new\.active then 'resumed'/);

assert.match(migration, /create function public\.record_practice_plan_change\(\)/);
assert.match(migration, /after insert or update on public\.practices/);
assert.match(migration, /when old\.status = 'active' and new\.status = 'paused' then 'paused'/);
assert.match(migration, /when old\.status = 'active' and new\.status = 'archived' then 'replaced'/);
assert.match(migration, /when identity_only_change then 'coach'/);

assert.match(regimen, /const desiredKeys = new Set/);
assert.match(regimen, /const removedIds = existing/);
assert.doesNotMatch(
  regimen,
  /update\(\{ active: false, updated_at: now \}\)[\s\S]{0,180}\.in\("item_kind", \["supplement", "endocrine_active_supplement"\]\)/,
  "Replacing supplements must not deactivate every retained item and create false ledger events.",
);

assert.match(accountExport, /label: "plan_change_events", table: "plan_change_events"/);
assert.match(accountDelete, /from\("users"\)\.delete\(\)\.eq\("id", user\.id\)/);

console.log("PR154 append-only Plan Change Ledger assertions passed");
