import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const migrationName = fs
  .readdirSync(migrationsDir)
  .find((name) => name.endsWith("_pr163_private_access_foundation.sql"));

assert.ok(migrationName, "PR163 migration must exist");
const migration = fs
  .readFileSync(path.join(migrationsDir, migrationName), "utf8")
  .toLowerCase()
  .replace(/\s+/g, " ");

for (const column of [
  "access_status",
  "billing_mode",
  "access_granted_at",
  "access_revoked_at",
  "access_source",
]) {
  assert.match(migration, new RegExp(`add column ${column}\\b`), `${column} must be additive`);
}
assert.match(migration, /when tier in \('premium', 'trial'\) then 'private_member'/);
assert.match(migration, /revoke insert, update on table public\.users from anon, authenticated/);
assert.match(migration, /drop policy if exists "users: update own" on public\.users/);
assert.doesNotMatch(migration, /grant (?:insert|update).*public\.users to (?:anon|authenticated)/);
assert.match(migration, /create or replace function private\.sync_legacy_user_access\(\)/);
assert.match(migration, /security invoker/);
assert.match(migration, /set search_path = ''/);
assert.match(
  migration,
  /revoke execute on function private\.sync_legacy_user_access\(\) from public, anon, authenticated, service_role/,
);
assert.match(migration, /create trigger sync_legacy_user_access/);

const entitlement = fs.readFileSync(path.join(root, "src", "lib", "serverEntitlements.ts"), "utf8");
assert.match(entitlement, /requirePrivateAccessApi/);
assert.match(entitlement, /privateAccess/);
assert.match(entitlement, /loadPrivateAccess/);

const legacyGuard = fs.readFileSync(path.join(root, "app", "_auth", "requireTier.ts"), "utf8");
assert.match(legacyGuard, /getSupabaseAdmin\(\)/, "fallback provisioning must remain server-controlled");

const productMode = fs.readFileSync(path.join(root, "src", "lib", "productMode.ts"), "utf8");
assert.match(productMode, /import "server-only"/);

for (const relative of [".env.example", ".env.local.sample", "src/lib/env.ts", "scripts/check-env.mjs"]) {
  const contents = fs.readFileSync(path.join(root, relative), "utf8");
  for (const name of [
    "LVE360_ACCESS_MODE",
    "LVE360_PUBLIC_PRICING_ENABLED",
    "LVE360_PUBLIC_SIGNUP_ENABLED",
    "LVE360_BILLING_CHECKOUT_ENABLED",
    "LVE360_INVITATION_ISSUANCE_ENABLED",
    "LVE360_FOUNDER_USER_ID",
  ]) {
    assert.ok(contents.includes(name), `${relative} must include ${name}`);
  }
}

console.log("PR163 private access foundation architecture checks passed.");
