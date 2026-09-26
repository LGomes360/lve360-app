import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260920005625_health_shortcuts_pilot.sql", "utf8");
const key = readFileSync("app/api/health/apple/shortcuts/key/route.ts", "utf8");
const sync = readFileSync("app/api/health/apple/shortcuts/sync/route.ts", "utf8");
const setup = readFileSync("app/(app)/settings/connected-health/HealthShortcutSetup.tsx", "utf8");
const setupPage = readFileSync("app/(app)/settings/connected-health/page.tsx", "utf8");
const summary = readFileSync("src/lib/connectedHealthData.ts", "utf8");

assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.health_shortcut_tokens from public, anon, authenticated/i);
assert.match(migration, /token_hash text not null unique/i);
assert.match(migration, /provider in \('apple_health', 'apple_health_shortcuts'\)/);
assert.match(key, /hashHealthShortcutToken\(token\)/);
assert.match(key, /sameOrigin\(request\)/);
assert.match(key, /revoked_at: now/);
assert.match(key, /connected_health_daily_metrics/);
assert.match(sync, /readHealthShortcutToken/);
assert.match(sync, /loadPrivateAccess/);
assert.match(sync, /parseHealthShortcutMeasurement/);
assert.match(sync, /\.eq\("token_hash", hashHealthShortcutToken\(token\)\)/);
assert.match(sync, /provider: "apple_health_shortcuts"/);
assert.match(key, /\.eq\("provider", "apple_health_shortcuts"\)/);
assert.match(summary, /chooseConnectedHealthProvider\(connections\.map/);
assert.match(summary, /row\.provider === "apple_health" \? nativeMetricsResult\.data : shortcutMetricsResult\.data/);
assert.match(setup, /Copy private value/);
assert.match(setup, /Disconnect and delete imports/);
assert.match(setup, /Add LVE360 Shortcut/);
assert.match(setup, /The one-tap installer is not ready yet/);
assert.doesNotMatch(setup, /Get Contents of URL|Authorization header|Sync URL/);
assert.match(setupPage, /APPLE_HEALTH_SHORTCUT_SHARE_URL/);
assert.match(setupPage, /www\.icloud\.com/);
assert.doesNotMatch(setup, /localStorage|sessionStorage/);

console.log("PR185 Health Shortcuts architecture assertions passed.");
