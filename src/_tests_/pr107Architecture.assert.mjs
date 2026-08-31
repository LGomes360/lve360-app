import assert from "node:assert/strict";
import fs from "node:fs";

const data = fs.readFileSync("src/lib/ai/contextualCoachData.ts", "utf8");
const route = fs.readFileSync("app/api/coach/route.ts", "utf8");
const coach = fs.readFileSync("src/components/coach/AskLve360Coach.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260814023126_pr107_coaching_diagnostics.sql", "utf8");

assert.match(data, /classif(?:ied_intent|ied intent)/i, "The model must receive a deterministic intent.");
assert.match(data, /curated evidence_options/i, "The prompt must distinguish LVE360 evidence from member records.");
assert.match(data, /applySafetyChecks\(context\.safetyContext/, "Generated candidates must pass a deterministic post-generation safety check.");
assert.match(data, /validateCoachTaskSuccess/, "A deterministic task-success gate must run before display.");
assert.match(data, /fallbackStructured/, "A failed model or quality gate must have a useful evidence-bound repair path.");
assert.match(data, /already_in_stack/, "The prompt context must explicitly identify existing Routine candidates.");
assert.match(data, /Recommendation is not mutation/i, "The prompt must separate recommendations from stored-record changes.");
assert.match(data, /is already in your current Routine/, "A mutation request for an existing item must identify it instead of offering to add a duplicate.");
assert.match(data, /requiresReviewBeforeStart/, "A non-current recommendation with a safety-review finding must not become a self-start instruction.");
assert.match(data, /isCurrentRecommendation/, "An already-recorded recommendation must not become an instruction to add a duplicate.");
assert.match(data, /explicitlyNamedEvidenceOption/, "A direct question about a named option must stay focused on that option.");
assert.match(data, /Keep your saved Routine unchanged until that review is complete/, "Safety-review recommendations must hand off to a clinician or pharmacist before a new start.");
assert.match(route, /classifyCoachRequest\(question\)/, "The API must classify intent and constraints before context assembly.");
assert.match(route, /quality_score/, "The API must persist privacy-safe quality diagnostics.");
assert.match(migration, /service-role only/i, "The additive migration must preserve server-only writes and existing RLS.");
assert.match(coach, /health record, evidence library, and safety rules/i, "The UI must describe all four product layers accurately.");

console.log("PR107 coaching architecture assertions passed.");
