import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const mcp = read("supabase/functions/health-context-mcp/index.ts");
const migration = read("supabase/migrations/20260927213000_pr190_chatgpt_oauth_audience.sql");

assert.match(mcp, /import \{ pipeline \} from "npm:@supabase\/middleware@\^0\.5\.0"/);
assert.match(mcp, /pipeline\(\s*\[\s*withOAuthProtectedResource\(\),\s*withSupabase\(/s);
assert.match(mcp, /SUPABASE_PUBLISHABLE_KEY/);
assert.match(mcp, /SUPABASE_ANON_KEY/);
assert.match(mcp, /userClaims\.id\.toLowerCase\(\) !== founderUserId/);
assert.match(mcp, /"get_lve360_health_handoff_status"/);
assert.match(mcp, /"save_lve360_health_context"/);
assert.match(mcp, /member_approved: z\.literal\(true\)/);
assert.match(mcp, /sleep: area/);
assert.match(mcp, /exercise: area/);
assert.match(mcp, /diet_weight: area/);
assert.match(mcp, /overall_feeling: overallFeelingArea/);
assert.match(mcp, /lab_balance: labArea/);
assert.match(mcp, /source_lab_reference_ranges/);
assert.match(mcp, /Remove diagnoses, healthy\/unhealthy labels, and medication or supplement change instructions/);
assert.doesNotMatch(mcp, /readMcpMethod|logMcpResponse|request\.clone\(\)\.json/);

assert.match(migration, /create or replace function public\.custom_access_token_hook\(event jsonb\)/);
assert.match(migration, /registration_type::text = 'dynamic'/);
assert.match(migration, /client_type::text = 'public'/);
assert.match(migration, /client_name = 'ChatGPT'/);
assert.match(migration, /redirect_uris ~ '\^https:\/\/chatgpt\\\.com\/connector\/oauth\//);
assert.match(migration, /functions\/v1\/health-context-mcp/);
assert.match(migration, /return event;\s*exception\s*when others then[\s\S]*return event;/);
assert.match(migration, /grant execute on function public\.custom_access_token_hook\(jsonb\) to supabase_auth_admin/);
assert.match(migration, /revoke execute on function public\.custom_access_token_hook\(jsonb\) from public, anon, authenticated/);

console.log("PR190 health MCP discovery assertions passed.");
