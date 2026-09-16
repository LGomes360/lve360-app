import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const migrationName = fs
  .readdirSync(migrationsDir)
  .find((name) => name.endsWith("_founder_learning_scorecard_api.sql"));

assert.ok(migrationName, "PR182 founder scorecard migration must exist");

const migration = fs
  .readFileSync(path.join(migrationsDir, migrationName), "utf8")
  .toLowerCase()
  .replace(/\s+/g, " ");

assert.match(
  migration,
  /create or replace function public\.founder_paid_beta_learning_scorecard\(\)/,
  "the founder scorecard must use a narrow public Data API bridge",
);
assert.match(migration, /security invoker/, "the reporting bridge must retain caller permissions");
assert.match(migration, /set search_path = ''/, "the reporting bridge must use an explicit empty search path");
assert.match(
  migration,
  /from analytics\.paid_beta_learning_scorecard/,
  "the bridge must reuse the canonical private aggregate view",
);
assert.match(
  migration,
  /revoke all on function public\.founder_paid_beta_learning_scorecard\(\) from public, anon, authenticated, service_role;/,
  "the bridge must clear inherited execution privileges",
);
assert.match(
  migration,
  /grant execute on function public\.founder_paid_beta_learning_scorecard\(\) to service_role;/,
  "only trusted server code may execute the bridge",
);
assert.doesNotMatch(
  migration,
  /grant execute on function public\.founder_paid_beta_learning_scorecard\(\) to (public|anon|authenticated)/,
  "browser roles must never receive scorecard execution access",
);

const loader = fs.readFileSync(path.join(root, "src", "lib", "founderDashboard.ts"), "utf8");
assert.match(
  loader,
  /admin\.rpc\("founder_paid_beta_learning_scorecard"\)/,
  "the founder dashboard must query through the service-role-only RPC",
);
assert.doesNotMatch(
  loader,
  /\.schema\("analytics"\)/,
  "the founder dashboard must not require exposing the private analytics schema",
);

console.log("PR182 founder scorecard access checks passed.");
