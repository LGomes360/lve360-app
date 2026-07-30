import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260729210709_grant_authenticated_intake_events_select.sql"
);

assert.match(
  migration,
  /alter table public\.intake_events enable row level security/i,
  "Intake events must keep row-level security enabled."
);
assert.match(
  migration,
  /revoke all on table public\.intake_events from public, anon/i,
  "Anonymous roles must not receive intake-event table access."
);
assert.match(
  migration,
  /revoke insert, update, delete on table public\.intake_events from authenticated/i,
  "Authenticated clients must not write intake events directly."
);
assert.match(
  migration,
  /grant select on table public\.intake_events to authenticated/i,
  "Authenticated members need table-level read access before owner RLS can run."
);
assert.doesNotMatch(
  migration,
  /grant\s+(?:select,\s*)?(?:insert|update|delete)[^;]*to authenticated/i,
  "Authenticated members must not gain direct write privileges."
);

const statusRoute = read("app/api/intake/status/route.ts");
assert.match(statusRoute, /requirePaidApi/, "Intake status must remain paid-gated.");
assert.match(statusRoute, /\.eq\("user_id", userId\)/, "Status reads must remain user-scoped.");

const setRoute = read("app/api/intake/set/route.ts");
assert.match(setRoute, /requirePaidApi/, "Intake writes must remain paid-gated.");
assert.match(setRoute, /getSupabaseAdmin/, "Intake writes must remain server-controlled.");
assert.match(
  setRoute,
  /\{\s*user_id:\s*userId,\s*item_id:\s*itemId,\s*intake_date:\s*today,\s*taken\s*\}/,
  "Server writes must bind the authenticated user ID."
);

console.log("Intake permission assertions passed.");
