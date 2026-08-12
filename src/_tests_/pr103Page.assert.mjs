import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const page = read("app/(app)/blueprints/[stackId]/page.tsx");
const workspace = read("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx");
const panel = read("app/(app)/blueprints/[stackId]/BlueprintDeltaPanel.tsx");
const delta = read("src/lib/blueprintDelta.ts");

assert.match(page, /supersedes_stack_id/, "The exact predecessor should be preferred for a refresh comparison.");
assert.match(page, /buildBlueprintDelta/, "Blueprint comparison must be assembled on the server.");
assert.match(workspace, /BlueprintDeltaPanel/, "The current Blueprint workspace must render its change summary.");
assert.match(panel, /Since your last Blueprint/, "The summary must explain its comparison frame.");
assert.match(panel, /does not guess why your health information changed/, "The summary must disclose its causal boundary.");
assert.match(panel, /Open prior version/, "Members must be able to inspect the earlier source report.");
assert.match(panel, /See evidence/, "Material current recommendations must link to evidence.");
assert.match(panel, /Safety status comes from LVE360&apos;s deterministic report review/, "Safety authority must be explicit.");
assert.match(delta, /deriveBlueprintSafetyStatus/, "Safety changes must use the deterministic safety parser.");
assert.doesNotMatch(delta, /openai|generateText|generateObject/i, "Recommendation classification must not be delegated to a model.");
assert.match(delta, /not an instruction to stop a medication, supplement, or hormone/, "Removed ideas must not become stop instructions.");

console.log("PR103 page and safety-boundary assertions passed.");
