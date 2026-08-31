import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const engine = readFileSync("src/lib/safetyEngine.ts", "utf8");
const loader = readFileSync("src/lib/safetyCheck.ts", "utf8");
const memberData = readFileSync("src/lib/memberContextData.ts", "utf8");
const coachData = readFileSync("src/lib/ai/contextualCoachData.ts", "utf8");
const coachIntent = readFileSync("src/lib/coachIntent.ts", "utf8");
const coachValidation = readFileSync("src/lib/coachTaskValidation.ts", "utf8");
const blueprintPage = readFileSync("app/(app)/blueprints/[stackId]/page.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260815140848_safety_provenance_unit_normalization.sql", "utf8");

for (const field of [
  "source_label",
  "source_type",
  "last_reviewed_on",
  "exact_ingredient_form",
  "interaction_mechanism",
  "severity_rationale",
  "confidence",
  "user_qualification",
  "rule_version",
  "provenance_status",
]) {
  assert.match(migration, new RegExp(`add column if not exists ${field}`), `${field} must be additive and migration-managed.`);
  assert.match(loader, new RegExp(`"${field}"`), `${field} must be loaded into deterministic evaluations.`);
}

assert.match(migration, /where lower\(ingredient\) = 'vitamin d3'/);
assert.match(migration, /where lower\(ingredient\) = 'probiotic \(lacto\/bifido blend\)'/);
assert.match(migration, /set binds_thyroid_meds = false/);
assert.match(migration, /provenance_status = 'reviewed'/);
assert.match(migration, /default 'unreviewed'/, "Legacy rows must remain explicit rather than receiving fabricated provenance.");
assert.match(migration, /add column if not exists updated_at timestamptz default now\(\)/, "The migration must repair the existing update-trigger/schema mismatch.");

assert.match(engine, /dose\.amount \/ 40/);
assert.match(engine, /dose\.amount \* 40/);
assert.match(engine, /dose_unit_not_comparable/);
assert.match(engine, /instruction_authority/);
assert.doesNotMatch(engine, /sep_hours_thyroid \?\? 4/, "The engine must not invent a four-hour interval when no interval is recorded.");
assert.match(engine, /clinicianDirectedException/);
assert.match(engine, /Do not change it from this app warning alone/);
assert.match(engine, /Why this appeared:/);
assert.match(engine, /Confidence:/);

assert.match(memberData, /instruction_authority: item\.instruction_authority/);
assert.match(coachData, /instruction_authority: current\?\.instruction_authority/);
assert.match(coachIntent, /item\.evidence\.confidence/);
assert.match(coachData, /deterministicNamedSafetyAnswer/);
assert.match(coachData, /namedCurrentSupplements/);
assert.match(coachData, /namedSafetyCandidateKeys/);
assert.match(coachData, /GENERIC_REGIMEN_WORDS/, "Named-item matching must not broaden Vitamin D to every vitamin or magnesium form.");
assert.match(coachValidation, /namedRegimen/, "Safety validation must be scoped to the regimen items the member actually named.");
assert.match(blueprintPage, /applySafetyEvaluationToMarkdown/, "The latest Blueprint must overlay a fresh deterministic safety review.");
assert.match(blueprintPage, /if \(latestId === stack\.id\)/, "Historical Blueprint versions must remain historical snapshots.");

console.log("PR111 safety provenance architecture checks passed.");
