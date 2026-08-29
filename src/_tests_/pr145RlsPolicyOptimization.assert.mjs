import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const migrationName = fs
  .readdirSync(migrationsDir)
  .find((name) => name.endsWith("_pr145_rls_policy_optimization.sql"));

assert.ok(migrationName, "PR145 migration must exist");

const migration = fs
  .readFileSync(path.join(migrationsDir, migrationName), "utf8")
  .toLowerCase()
  .replace(/\s+/g, " ");

const redundantPolicies = [
  ["stacks: select own", "public.stacks"],
  ["stacks_items: select via owned stack", "public.stacks_items"],
  [
    "submission_medications: select via owned submission",
    "public.submission_medications",
  ],
  [
    "submission_supplements: select via owned submission",
    "public.submission_supplements",
  ],
  [
    "submission_hormones: select via owned submission",
    "public.submission_hormones",
  ],
];

for (const [policyName, tableName] of redundantPolicies) {
  assert.ok(
    migration.includes(
      `drop policy if exists "${policyName}" on ${tableName};`,
    ),
    `${policyName} must be removed as a redundant permissive policy`,
  );
  assert.ok(
    !migration.includes(`create policy "${policyName}"`),
    `${policyName} must not be recreated`,
  );
}

const optimizedPolicies = [
  "logs: select own",
  "logs: insert own",
  "logs: update own",
  "submissions: select own",
  "users: select own",
  "users: insert own",
  "users: update own",
];

for (const policyName of optimizedPolicies) {
  assert.ok(
    migration.includes(`create policy "${policyName}"`),
    `${policyName} must be recreated explicitly`,
  );
}

assert.equal(
  (migration.match(/create policy /g) ?? []).length,
  optimizedPolicies.length,
  "PR145 must not create policies outside its reviewed scope",
);
assert.equal(
  (migration.match(/\(select auth\.uid\(\)\)/g) ?? []).length,
  9,
  "every recreated ownership predicate must use the cached auth.uid() form",
);
assert.doesNotMatch(
  migration,
  /(?:using|with check) \([^;]*?= auth\.uid\(\)/,
  "PR145 must not retain per-row auth.uid() evaluation",
);
assert.doesNotMatch(
  migration,
  /\bto\s+(?:anon|public|service_role)\b/,
  "PR145 policies must remain authenticated-member only",
);

console.log("PR145 RLS policy optimization checks passed.");
