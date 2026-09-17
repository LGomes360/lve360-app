import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260917002121_apple_health_foundation.sql", "utf8");
const route = readFileSync("app/api/health/apple/sync/route.ts", "utf8");
const todayPage = readFileSync("app/(app)/today/page.tsx", "utf8");
const todayClient = readFileSync("app/(app)/today/TodayClient.tsx", "utf8");
const accountExport = readFileSync("app/api/account/export/route.ts", "utf8");

assert.match(migration, /enable row level security/g);
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(migration, /revoke all on table public\.connected_health_daily_metrics from public, anon, authenticated/);
assert.match(migration, /grant select on table public\.connected_health_daily_metrics to authenticated/);
assert.doesNotMatch(migration, /clinical_record|workout_route/i);
assert.match(route, /admin\.auth\.getUser\(accessToken\)/);
assert.match(route, /loadPrivateAccess\(user\.id\)/);
assert.match(route, /private_access_required/);
assert.match(route, /validateAppleHealthSyncPayload/);
assert.match(route, /onConflict: "user_id,provider,local_date"/);
assert.doesNotMatch(route, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
assert.match(todayPage, /loadConnectedHealthSummary/);
assert.match(todayClient, /ConnectedHealthCard/);
assert.match(accountExport, /connected_health_daily_metrics/);
assert.match(accountExport, /error\.code === "PGRST205"/);

console.log("PR183 connected health architecture assertions passed.");
