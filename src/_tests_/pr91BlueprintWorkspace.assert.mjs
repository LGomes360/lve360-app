import assert from "node:assert/strict";
import fs from "node:fs";

const blueprint = fs.readFileSync("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx", "utf8");

assert.match(blueprint, /Your decision map/);
assert.match(blueprint, /What needs your attention/);
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
assert.doesNotMatch(blueprint, /<details/);
assert.doesNotMatch(blueprint, /<summary/);
assert.match(blueprint, /id=\{sectionId\}/);
assert.match(blueprint, /I have reviewed these safety notes/);
assert.match(blueprint, /href="\/routine"/);

console.log("PR91 Blueprint decision workspace assertions passed.");
