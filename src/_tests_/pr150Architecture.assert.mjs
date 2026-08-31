import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260831030031_pr150_practice_reconciliation.sql");
const activation = read("app/api/activation/route.ts");
const review = read("app/api/weekly-review/route.ts");
const memberData = read("src/lib/memberContextData.ts");
const memberContext = read("src/lib/memberContext.ts");
const accountExport = read("app/api/account/export/route.ts");

assert.match(migration, /origin_experiment_id uuid references public\.weekly_experiments\(id\) on delete set null/);
assert.match(migration, /decision in \('keep', 'shrink', 'advance'\)/);
assert.match(migration, /status <> 'draft'/, "Incomplete onboarding drafts must not be backfilled as canonical Practices.");
assert.match(migration, /create function public\.activate_weekly_experiment/);
assert.match(migration, /for update/);
assert.match(migration, /grant execute on function public\.activate_weekly_experiment\(uuid, uuid\)[\s\S]*to service_role/);
assert.doesNotMatch(migration, /grant execute on function public\.activate_weekly_experiment[\s\S]*to authenticated/);
assert.match(migration, /p_decision = 'pause'[\s\S]*status = 'paused'/);
assert.match(migration, /preserves_practice := p_decision in \('keep', 'shrink', 'advance'\)/);
assert.match(migration, /insert into public\.weekly_experiments \([\s\S]*user_id, practice_id/);
assert.match(migration, /set status = 'archived', archived_at = now\(\)/);

assert.match(activation, /rpc\("activate_weekly_experiment"/);
assert.match(activation, /experiment\.status === "active" && experiment\.practice_id && step === 6/);
assert.match(review, /from\("practices"\)\.update/);
assert.match(memberData, /from\("practices"\)/);
assert.match(memberData, /id,practice_id,source_stack_id/);
assert.match(memberContext, /durablePracticeId/);
assert.match(memberContext, /source: "practices"/);
assert.match(accountExport, /label: "practices", table: "practices"/);

console.log("PR150 durable Practice reconciliation assertions passed");
