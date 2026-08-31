import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260831222704_pr155_plan_change_ledger_privilege_hardening.sql",
  "utf8",
);

assert.match(
  migration,
  /revoke all on table public\.plan_change_events from service_role/,
  "Supabase's automatic service-role privileges must be explicitly cleared.",
);
assert.match(
  migration,
  /grant select, insert on table public\.plan_change_events to service_role/,
  "The application needs only event insertion and account-export reads.",
);
assert.doesNotMatch(
  migration,
  /^\s*grant\b[^;]*(?:update|delete|truncate|references|trigger)[^;]*plan_change_events/im,
  "The application service role must not be able to rewrite ledger history.",
);
assert.match(migration, /service-role writes are insert-only/);

console.log("PR155 Plan Change Ledger privilege-hardening assertions passed");
