import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const consent = read("app/oauth/consent/page.tsx");
const switchAccount = read("app/api/oauth/switch-account/route.ts");
const login = read("app/login/page.tsx");
const mcp = read("supabase/functions/health-context-mcp/index.ts");
const migration = read("supabase/migrations/20260926073000_pr187_health_context_handoffs.sql");

assert.match(consent, /user\.email\?\.trim\(\)\.toLowerCase\(\)/);
assert.match(consent, /Your ChatGPT and LVE360 email addresses do not need to match/);
assert.match(consent, /Health context is saved only to the LVE360 account shown here/);
assert.match(consent, /action="\/api\/oauth\/switch-account"/);
assert.match(consent, /Use a different LVE360 account/);
assert.match(consent, /name="authorization_id" value=\{authorizationId\}/);

assert.match(switchAccount, /authorizationId\.trim\(\)\.length > 500/);
assert.match(switchAccount, /signOut\(\{ scope: "local" \}\)/);
assert.match(switchAccount, /`\/oauth\/consent\?authorization_id=\$\{encodeURIComponent\(normalizedAuthorizationId\)\}`/);
assert.match(switchAccount, /loginUrl\.searchParams\.set\("next", next\)/);
assert.match(switchAccount, /NextResponse\.redirect\(loginUrl, 303\)/);

assert.match(login, /connectorLogin/);
assert.match(login, /Your ChatGPT and LVE360 email addresses may be different/);
assert.match(login, /queryParams: \{ prompt: "select_account" \}/);

assert.match(mcp, /supabase\.auth\.getUser\(\)/);
assert.match(mcp, /user\.id\.toLowerCase\(\) !== founderUserId/);
assert.doesNotMatch(mcp, /predoctor69|ChatGPT.*email/i);
assert.match(migration, /user_id uuid not null default auth\.uid\(\)/);
assert.match(migration, /\(select auth\.uid\(\)\) = user_id/);

console.log("PR189 OAuth account-choice assertions passed.");
