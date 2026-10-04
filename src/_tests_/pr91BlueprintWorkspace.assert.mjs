import assert from "node:assert/strict";
import fs from "node:fs";

const blueprint = fs.readFileSync("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx", "utf8");

assert.match(blueprint, /Report review/);
assert.match(blueprint, /What this Blueprint asks you to review/);
assert.match(blueprint, /Ideas to decide/);
assert.match(blueprint, /Safety review/);
assert.match(blueprint, /Put it into practice/);
assert.match(blueprint, /Why your Blueprint says this/);
assert.match(blueprint, /reportSectionCategory/);
assert.match(blueprint, /Current supplements, amounts, timing, and status/);
assert.match(blueprint, /history\.slice\(0, 6\)/);
assert.match(blueprint, /components=\{\{/);
assert.match(blueprint, /target=\{external \? "_blank"/);
assert.match(blueprint, /scrollIntoView\(\{ behavior: "smooth"/);
assert.match(blueprint, /section\.name !== "This Week Try"/);
assert.match(blueprint, /listFormattedSections/);
assert.match(blueprint, /Read the original dated introduction/, "The archived introduction must remain available without overriding today's context.");
assert.match(blueprint, /Read the original saved recommendations/, "Display reconciliation must preserve the saved report.");
assert.match(blueprint, /name === "Intro Summary" \? \(/, "Only the dated introduction is initially collapsed; safety notes stay visible.");
assert.match(blueprint, /id=\{sectionId\}/);
assert.match(blueprint, /I have reviewed these safety notes/);
assert.match(blueprint, /href="\/routine"/);

console.log("PR91 Blueprint decision workspace assertions passed.");
