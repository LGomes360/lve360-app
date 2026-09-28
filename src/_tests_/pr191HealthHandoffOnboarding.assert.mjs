import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const card = read("src/components/settings/HealthContextCard.tsx");
const setup = read("src/lib/healthContextSetup.ts");
const contract = read("docs/chatgpt-health-handoff.md");

assert.match(card, /Copy starter request/);
assert.match(card, /Your ChatGPT and LVE360 email addresses may be different/);
assert.match(card, /nothing will be stored until you approve the exact five-area summary/);
assert.match(card, /HEALTH_CONTEXT_STARTER_REQUEST/);
assert.match(card, /navigator\.clipboard\.writeText/);
assert.match(card, /readOnly/);

assert.match(setup, /exactly these five areas: sleep, exercise, diet and weight, overall feeling, and lab balance/i);
assert.match(setup, /Do not save anything to LVE360 yet/);
assert.match(setup, /Approve and send this summary to LVE360/);
assert.match(setup, /collection dates, units, and the source laboratory's reference ranges/);
assert.match(setup, /Do not diagnose/);

assert.match(contract, /Production validation status — September 28, 2026/);
assert.match(contract, /read-only status tool returned successfully/);
assert.match(contract, /No health-context write has been approved or performed/);
assert.match(contract, /explicitly approved save.*Today display.*deletion/i);

console.log("PR191 health handoff onboarding assertions passed.");

