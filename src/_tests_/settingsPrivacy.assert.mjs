import assert from "node:assert/strict";
import fs from "node:fs";

const settings = fs.readFileSync("app/(app)/settings/page.tsx", "utf8");
const accountRoute = fs.readFileSync("app/api/account/route.ts", "utf8");
const deleteRoute = fs.readFileSync("app/api/account/delete/route.ts", "utf8");
const exportRoute = fs.readFileSync("app/api/account/export/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260726090000_account_preferences.sql", "utf8");

assert.match(settings, /\/api\/account\/export/, "Settings must provide a data download");
assert.match(settings, /deleteConfirmation\.trim\(\)\.toLowerCase\(\)/, "Deletion must require typed confirmation");
assert.match(settings, /support@lve360\.com/, "Settings must provide a support path");
assert.match(accountRoute, /supabase\.auth\.getUser\(\)/, "Preferences must require an authenticated user");
assert.match(deleteRoute, /confirmation\.trim\(\)\.toLowerCase\(\) !== user\.email\.toLowerCase\(\)/, "The API must verify the account email");
assert.match(deleteRoute, /admin\.auth\.admin\.deleteUser\(user\.id\)/, "Deletion must remove the authentication account");
assert.match(exportRoute, /Cache-Control": "private, no-store"/, "Exports must not be cached");
assert.match(migration, /enable row level security/, "Preferences must have RLS enabled");
assert.match(migration, /revoke all on public\.user_preferences from anon/, "Anonymous access must be revoked");

console.log("settings and privacy assertions passed");
