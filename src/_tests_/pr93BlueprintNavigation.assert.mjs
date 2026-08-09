import assert from "node:assert/strict";
import fs from "node:fs";

const blueprint = fs.readFileSync("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx", "utf8");

assert.match(blueprint, /id="current-supplements"/);
assert.match(blueprint, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
assert.match(blueprint, /target=\{external \? "_blank" : undefined\}/);
assert.match(blueprint, /noopener noreferrer/);
assert.match(blueprint, /section\.name !== "This Week Try"/);
assert.match(blueprint, /Contraindications & Med Interactions/);
assert.match(blueprint, /Dosing & Notes/);
assert.match(blueprint, /Evidence & References/);
assert.match(blueprint, /Shopping Links/);
assert.match(blueprint, /Follow-up Plan/);
assert.match(blueprint, /Lifestyle Foundations/);
assert.match(blueprint, /Longevity Levers/);

console.log("PR93 Blueprint navigation and formatting assertions passed.");
