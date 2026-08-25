import assert from "node:assert/strict";
import fs from "node:fs";

const home = fs.readFileSync("app/page.tsx", "utf8");
const pricing = fs.readFileSync("app/pricing/page.tsx", "utf8");
const layout = fs.readFileSync("app/layout.js", "utf8");

for (const source of [home, pricing]) {
  assert.match(source, /Free Blueprint/);
  assert.match(source, /Membership/);
  assert.match(source, /Knows your context/);
  assert.match(source, /Decides what matters now/);
  assert.match(source, /Learns from/);
}

assert.match(home, /Know what matters today\. Build better health over time\./);
assert.match(home, /A personalized snapshot/);
assert.match(home, /A living decision system/);
assert.match(pricing, /What matters now\? Why this\? What is working\?/);
assert.match(pricing, /\$15 \/ month/);
assert.match(pricing, /\$100 \/ year/);
assert.match(pricing, /No purchase required/);
assert.match(layout, /LVE360 \| Know what matters today/);

for (const source of [home, pricing]) {
  assert.doesNotMatch(source, /diagnos(?:e|es|ed|ing) your/i);
  assert.doesNotMatch(source, /treats? your/i);
}

console.log("PR129 public promise assertions passed.");
