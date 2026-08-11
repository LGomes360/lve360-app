import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const config = read("src/lib/ai/modelConfig.ts");
const gateway = read("src/lib/ai/gateway.ts");
const transport = read("src/lib/openai.ts");
const generator = read("src/lib/generateStack.ts");
const insights = read("app/api/ai-insights/route.ts");
const accountExport = read("app/api/account/export/route.ts");
const envExample = read(".env.example");
const migrationName = fs.readdirSync(path.join(root, "supabase/migrations"))
  .find((name) => name.endsWith("_pr99_ai_generation_ledger.sql"));

assert.ok(migrationName, "PR99 must include the AI generation ledger migration.");
const migration = read(`supabase/migrations/${migrationName}`);

for (const name of [
  "OPENAI_MAIN_MODEL",
  "OPENAI_MINI_MODEL",
  "OPENAI_FALLBACK_MAIN_MODEL",
  "OPENAI_FALLBACK_MINI_MODEL",
]) {
  assert.match(config, new RegExp(name), `${name} must be resolved centrally.`);
  assert.match(envExample, new RegExp(`^${name}=`, "m"), `${name} must be documented.`);
}

assert.match(config, /weekly_insight[\s\S]*capability: "mini"/, "Routine insights must use the cost-efficient capability.");
assert.match(config, /blueprint_narrative[\s\S]*capability: "main"/, "Blueprint narrative must use the quality capability.");
assert.match(gateway, /candidateModels\(profile\.capability\)/, "All product generations must use central routing.");
assert.match(gateway, /context_hash: contextHash/, "The ledger must use a one-way context fingerprint.");
assert.doesNotMatch(gateway, /prompt: options\.messages|response_text/, "The ledger must not store prompt or response content.");
assert.match(transport, /store: false/, "OpenAI response storage must be disabled.");
assert.match(transport, /safety_identifier/, "Member calls must include a privacy-preserving safety identifier.");
assert.match(generator, /generateAI/, "Blueprint generation must use the canonical AI gateway.");
assert.doesNotMatch(generator, /"gpt-5": "gpt-4o"/, "Newer models must never be silently aliased back to GPT-4o.");
assert.match(insights, /generateAI/, "Weekly insights must use the canonical AI gateway.");
assert.match(insights, /regimen_dose_events/, "Weekly insight adherence must use current routine events.");
assert.doesNotMatch(insights, /new OpenAI|chat\.completions/, "Paid insights must not bypass the gateway.");
assert.match(accountExport, /ai_generation_ledger/, "Members must be able to export their AI usage metadata.");

assert.match(migration, /alter table public\.ai_generation_ledger enable row level security/i);
assert.match(migration, /revoke all on table public\.ai_generation_ledger from public, anon, authenticated/i);
assert.match(migration, /grant select, insert on table public\.ai_generation_ledger to service_role/i);
assert.doesNotMatch(migration, /\bprompt\b\s+(text|jsonb)|\bresponse\b\s+(text|jsonb)/i, "The ledger must not persist health prompts or AI output.");

console.log("PR99 canonical AI gateway assertions passed.");
