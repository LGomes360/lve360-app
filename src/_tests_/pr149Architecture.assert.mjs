import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20260831023801_pr149_durable_practices.sql",
  "utf8",
);
const domain = await readFile("src/lib/practiceDomain.ts", "utf8");
const personaHarness = await readFile("src/_tests_/personaRegressionHarness.ts", "utf8");
const documentation = await readFile("docs/durable-practice-domain.md", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

assert.match(migration, /create table public\.practices/);
assert.match(migration, /user_id uuid not null references public\.users\(id\)[\s\S]*on delete cascade/);
assert.match(migration, /alter table public\.weekly_experiments[\s\S]*add column practice_id uuid references public\.practices\(id\) on delete set null/);
assert.doesNotMatch(migration, /add column practice_id uuid not null/);
assert.match(migration, /weekly_experiments_practice_id_week_idx/);
assert.match(migration, /alter table public\.practices enable row level security/);
assert.match(migration, /revoke all on table public\.practices from public, anon, authenticated/);
assert.match(migration, /grant select on table public\.practices to authenticated/);
assert.doesNotMatch(migration, /grant select, insert, update, delete on table public\.practices to authenticated/);
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(migration, /PR150 owns that reconciliation/);
assert.doesNotMatch(migration, /insert into public\.practices/);
assert.doesNotMatch(migration, /update public\.weekly_experiments/);

assert.match(documentation, /Practice versus weekly experiment/);
assert.match(documentation, /PR150 handoff/);
assert.match(documentation, /does not modify existing experiment rows/);

assert.match(domain, /durablePracticeSeedFromExperiment/);
assert.match(domain, /resolvePracticeContinuity/);
assert.match(domain, /decision === "pause"/);
assert.match(domain, /decision === "swap"/);
assert.match(personaHarness, /durable_practice_continuity/);
assert.equal(
  packageJson.scripts["qa:pr149"],
  "node --experimental-strip-types src/_tests_/pr149DurablePractice.assert.ts && node src/_tests_/pr149Architecture.assert.mjs && npm run qa:personas",
);

console.log("PR149 durable Practice architecture assertions passed.");
