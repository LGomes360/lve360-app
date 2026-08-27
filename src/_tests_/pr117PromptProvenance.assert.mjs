import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const versions = readFileSync("src/lib/ai/promptVersions.ts", "utf8");
const coach = readFileSync("src/lib/contextualCoach.ts", "utf8");
const modelConfig = readFileSync("src/lib/ai/modelConfig.ts", "utf8");
const gateway = readFileSync("src/lib/ai/gateway.ts", "utf8");
const route = readFileSync("app/api/coach/route.ts", "utf8");
const generation = readFileSync("src/lib/ai/contextualCoachData.ts", "utf8");

assert.match(versions, /export const CONTEXTUAL_COACH_PROMPT_VERSION\s*=\s*"contextual-coach-v6"/);
assert.match(coach, /import \{ CONTEXTUAL_COACH_PROMPT_VERSION \} from "\.\/ai\/promptVersions\.ts"/);
assert.match(coach, /COACH_PROMPT_VERSION\s*=\s*CONTEXTUAL_COACH_PROMPT_VERSION/);
assert.match(modelConfig, /import \{ CONTEXTUAL_COACH_PROMPT_VERSION \} from "\.\/promptVersions\.ts"/);
assert.match(modelConfig, /contextual_coach:\s*\{[\s\S]*?promptVersion:\s*CONTEXTUAL_COACH_PROMPT_VERSION/);

assert.match(gateway, /promptVersion:\s*profile\.promptVersion,[\s\S]*?messages:\s*options\.messages/, "The context hash must use the task profile version.");
assert.match(gateway, /prompt_version:\s*profile\.promptVersion/, "The generation ledger must use the task profile version.");
assert.match(route, /prompt_version:\s*COACH_PROMPT_VERSION/, "Saved coaching turns must use the canonical coaching version.");

assert.doesNotMatch(modelConfig, /contextual-coach-v\d+/, "The model profile must not duplicate the literal prompt version.");
assert.doesNotMatch(coach, /COACH_PROMPT_VERSION\s*=\s*"contextual-coach-v\d+"/, "The coaching route contract must not duplicate the literal prompt version.");
assert.doesNotMatch(generation, /\[coach\.v\d+\]/, "Console diagnostics must not become another prompt-version source.");

console.log("PR117 contextual-coach prompt provenance assertions passed.");
