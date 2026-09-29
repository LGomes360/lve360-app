import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260929021117_pr192_health_handoff_idempotency.sql");
const mcp = read("supabase/functions/health-context-mcp/index.ts");
const memberApi = read("app/api/health-context-handoff/route.ts");
const settings = read("src/components/settings/HealthContextCard.tsx");
const today = read("src/components/dashboard/ConnectedHealthCard.tsx");
const contract = read("docs/chatgpt-health-handoff.md");

assert.match(migration, /submission_fingerprint text/);
assert.match(migration, /\^\[0-9a-f\]\{64\}\$/);
assert.match(migration, /unique index if not exists health_context_handoffs_user_fingerprint_idx/);
assert.match(migration, /\(user_id, submission_fingerprint\)/);
assert.match(migration, /Rollback:/);

assert.match(mcp, /idempotentHint: true/);
assert.match(mcp, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(mcp, /findHandoffByFingerprint/);
assert.match(mcp, /error\?\.code === "23505"/);
assert.match(mcp, /duplicate/);
assert.match(mcp, /source_window_start,source_window_end,source,created_at/);
assert.match(mcp, /member_approved: z\.literal\(true\)/);
assert.match(mcp, /sleep: area/);
assert.match(mcp, /exercise: area/);
assert.match(mcp, /diet_weight: area/);
assert.match(mcp, /overall_feeling: overallFeelingArea/);
assert.match(mcp, /lab_balance: labArea/);

assert.match(memberApi, /\.delete\(\)[\s\S]*\.eq\("user_id", user\.id\)[\s\S]*\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
assert.match(memberApi, /handoff_not_found/);
assert.match(memberApi, /deleted_id: data\.id/);
assert.match(settings, /body\.deleted_id !== handoff\.id/);
assert.match(settings, /fetchLatestHandoff\(\)/);
assert.match(settings, /latest\?\.id === handoff\.id/);
assert.match(settings, /ChatGPT Health · five-area source window/);
assert.match(today, /ChatGPT Health · 5 areas/);
assert.match(today, /snapshot \{formatDate\(handoff\.snapshotDate\)\}/);

assert.match(contract, /PR192 release-gate hardening/);
assert.match(contract, /expired authorization, a revoked authorization, and a different LVE360 account/);
assert.match(contract, /payload missing any one of the five areas is rejected/);
assert.match(contract, /Passing code checks does \*\*not\*\* claim that a production health summary was saved/);

console.log("PR192 health-handoff release-gate assertions passed.");
