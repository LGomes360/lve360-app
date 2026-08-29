import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const migrationName = fs
  .readdirSync(migrationsDir)
  .find((name) => name.endsWith("_pr144_security_function_lockdown.sql"));

assert.ok(migrationName, "PR144 migration must exist");

const migration = fs
  .readFileSync(path.join(migrationsDir, migrationName), "utf8")
  .toLowerCase()
  .replace(/\s+/g, " ");

const triggerFunctions = [
  "enforce_lowercase_email",
  "enforce_lowercase_email_stacks",
  "enforce_lowercase_email_submissions",
  "handle_new_auth_user",
  "set_timestamp_updated_at",
  "set_updated_at",
];

for (const functionName of triggerFunctions) {
  assert.match(
    migration,
    new RegExp(
      `revoke execute on function public\\.${functionName}\\(\\) from public, anon, authenticated, service_role;`,
    ),
    `${functionName} must not be directly callable through the Data API`,
  );
}

for (const functionName of [
  "reconcile_user_and_attach",
  "reconcile_user_and_attach_v2",
]) {
  assert.match(
    migration,
    new RegExp(
      `revoke execute on function public\\.${functionName}\\(text, uuid\\) from public, anon, authenticated, service_role;`,
    ),
    `${functionName} must revoke inherited and direct browser access`,
  );
  assert.match(
    migration,
    new RegExp(
      `grant execute on function public\\.${functionName}\\(text, uuid\\) to service_role;`,
    ),
    `${functionName} must remain available to the server-only provisioning client`,
  );
  assert.doesNotMatch(
    migration,
    new RegExp(
      `grant execute on function public\\.${functionName}\\(text, uuid\\) to (public|anon|authenticated)`,
    ),
    `${functionName} must never be re-granted to browser roles`,
  );
}

assert.match(
  migration,
  /alter function public\.get_latest_stack_items\(\) security invoker;/,
  "member stack reads must run under the caller's RLS permissions",
);
assert.match(
  migration,
  /revoke execute on function public\.get_latest_stack_items\(\) from public, anon, authenticated, service_role;/,
  "member stack reads must clear inherited execution first",
);
assert.match(
  migration,
  /grant execute on function public\.get_latest_stack_items\(\) to authenticated, service_role;/,
  "signed-in members and trusted server code must retain stack-read access",
);

const provisionRoute = fs.readFileSync(
  path.join(root, "app", "api", "provision-user", "route.ts"),
  "utf8",
);
assert.match(
  provisionRoute,
  /supabaseAdmin\.rpc\("reconcile_user_and_attach_v2"/,
  "account reconciliation must remain on the server-only admin client",
);
assert.match(
  provisionRoute,
  /user\.email_confirmed_at/,
  "account reconciliation must require a verified member email",
);

const adminClient = fs.readFileSync(
  path.join(root, "src", "lib", "supabaseAdmin.ts"),
  "utf8",
);
assert.match(adminClient, /import ['"]server-only['"];/);
assert.match(adminClient, /SUPABASE_SERVICE_ROLE_KEY/);

console.log("PR144 privileged-function lockdown checks passed.");
