import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260926073000_pr187_health_context_handoffs.sql");
const mcp = read("supabase/functions/health-context-mcp/index.ts");
const config = read("supabase/config.toml");
const consent = read("app/oauth/consent/page.tsx");
const decision = read("app/api/oauth/decision/route.ts");
const memberApi = read("app/api/health-context-handoff/route.ts");
const settings = read("src/components/settings/HealthContextCard.tsx");
const today = read("app/(app)/today/page.tsx");
const contract = read("docs/chatgpt-health-handoff.md");

assert.match(migration, /enable row level security/i);
assert.match(migration, /member_approved is true/i);
assert.match(migration, /grant select, insert, delete .* authenticated/i);
assert.match(migration, /source_lab_reference_ranges/);
assert.match(migration, /never raw HealthKit/i);

assert.match(config, /\[functions\.health-context-mcp\][\s\S]*verify_jwt = false/);
assert.match(mcp, /withOAuthProtectedResource/);
assert.match(mcp, /withSupabase\(\{[\s\S]*auth: "user"/);
assert.match(mcp, /LVE360_FOUNDER_USER_ID/);
assert.match(mcp, /z\.strictObject/);
assert.match(mcp, /member_approved: z\.literal\(true\)/);
assert.match(mcp, /member_described: z\.literal\(true\)/);
assert.match(mcp, /prohibitedClinicalContent/);
assert.match(mcp, /save_lve360_health_context/);
assert.match(mcp, /Return metadata only/);
assert.doesNotMatch(mcp, /console\.(log|info).*input|console\.(log|info).*payload/);

assert.match(consent, /isFounderUser\(user\.id\)/);
assert.match(consent, /approve the exact content/i);
assert.match(consent, /Raw Apple Health samples/);
assert.match(decision, /isFounderUser\(user\.id\)/);
assert.match(decision, /skipBrowserRedirect: true/);
assert.match(memberApi, /\.eq\("user_id", user\.id\)/);
assert.match(settings, /Remove handoff/);
assert.match(today, /loadLatestHealthContextHandoff/);
assert.match(contract, /OAuth 2\.1/);
assert.match(contract, /live ChatGPT Health validation remains a release gate/i);

console.log("PR187 founder health-handoff architecture assertions passed.");
