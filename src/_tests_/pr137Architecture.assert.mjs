import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const packageJson = JSON.parse(read("package.json"));
const workflow = read(".github/workflows/ci.yml");
const fixtures = read("src/_tests_/fixtures/personaRegressionFixtures.ts");
const harness = read("src/_tests_/personaRegressionHarness.ts");
const documentation = read("docs/qa/persona-regression.md");

assert.match(packageJson.scripts["qa:personas"], /personaRegression\.assert\.ts/);
assert.match(packageJson.scripts["qa:personas"], /pr137Architecture\.assert\.mjs/);
assert.equal(packageJson.scripts["qa:pr137"], "npm run qa:personas");
assert.match(workflow, /node-version: '22'/);
assert.match(workflow, /name: Run 24-persona regression harness[\s\S]*npm run qa:personas/);
assert.match(fixtures, /PERSONA_REGRESSION_PERSONAS/);
assert.match(fixtures, /PERSONA_REGRESSION_WEEKS/);
assert.match(harness, /runPersonaRegressionHarness/);
assert.match(harness, /personaId/);
assert.match(harness, /week/);
assert.match(harness, /invariant/);
assert.match(documentation, /24 synthetic personas/);
assert.match(documentation, /does not prove/i);

console.log("PR137 persona regression architecture assertions passed.");
