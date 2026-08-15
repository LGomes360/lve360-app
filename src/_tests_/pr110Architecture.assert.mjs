import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/coach/route.ts", "utf8");
const data = readFileSync("src/lib/ai/contextualCoachData.ts", "utf8");
const validator = readFileSync("src/lib/coachTaskValidation.ts", "utf8");
const modelConfig = readFileSync("src/lib/ai/modelConfig.ts", "utf8");

assert.match(data, /validateCoachTaskSuccess/, "Production coaching must use intent-specific task-success validation.");
assert.doesNotMatch(data, /assessCoachAnswerQuality/, "The shallow PR107 quality heuristic must no longer gate production coaching.");
assert.match(data, /repairInstruction\(finalReport\)/, "The single repair attempt must receive explicit failed requirements.");
assert.match(data, /regenerationCount = 1/, "Repair behavior must be bounded and observable.");
assert.doesNotMatch(data, /for \(let attempt = 0; attempt < 2/, "The old parse-only retry loop must not remain in production.");
assert.match(data, /narrowSafeFallback/, "Invalid repair and deterministic failures need a narrow non-guessing fallback.");
assert.match(data, /fallbackReason/, "Fallback reasons must remain observable.");

assert.match(validator, /REGIMEN_COVERAGE/);
assert.match(validator, /REQUESTED_FIELDS/);
assert.match(validator, /TYPE_EXCLUSIONS/);
assert.match(validator, /SAFETY_FINDINGS/);
assert.match(validator, /CONSTRAINT_ADHERENCE/);
assert.match(validator, /MISSING_CONTEXT_ACCURACY/);
assert.match(validator, /CAUSAL_BOUNDARY/);
assert.match(validator, /MEMBER_CONTEXT_USE/);
assert.match(validator, /score: Math\.round\(completeness \* 100\)/, "The compatibility score must be derived from measured task completion.");

assert.match(route, /console\.info\("\[coach\.validation\]"/, "Privacy-safe task diagnostics must be emitted for each completed coaching attempt.");
assert.match(route, /generationStatus = diagnostics\.taskPassed \? "succeeded" : "failed"/, "Safe incomplete fallbacks must not be recorded as successful answers.");
assert.match(route, /regeneration_count: diagnostics\.regenerationCount/, "Repair count must remain stored in the existing diagnostics columns.");
assert.match(data, /contextual-coach-v4|coach\.v4/);
assert.match(modelConfig, /promptVersion:\s*"contextual-coach-v4"/);

console.log("PR110 task-success architecture checks passed.");
