import assert from "node:assert/strict";
import fs from "node:fs";

import { healthItemIdentityKey, validateGeneratedHealthItemIntegrity } from "../lib/healthItemIdentity.ts";
import parseMarkdownToItems from "../lib/parseMarkdownToItems.ts";

assert.equal(healthItemIdentityKey("Vitamin B12"), healthItemIdentityKey("b12 (methylcobalamin)"));
assert.notEqual(healthItemIdentityKey("Magnesium Glycinate"), healthItemIdentityKey("Magnesium Threonate"));
assert.equal(healthItemIdentityKey("Magtein"), healthItemIdentityKey("Magnesium L-Threonate"));

const proposalSource = fs.readFileSync("src/lib/reportRecommendationProposals.ts", "utf8");
const parserSource = fs.readFileSync("src/lib/parseMarkdownToItems.ts", "utf8");
const generatorSource = fs.readFileSync("src/lib/generateStack.ts", "utf8");
assert.match(proposalSource, /currentNames\.has\(healthItemIdentityKey\(name\)\)/);
assert.match(parserSource, /canonicalHealthItemDisplayName/);
assert.match(generatorSource, /healthItemIdentityKey/);
assert.match(generatorSource, /validateGeneratedHealthItemIntegrity/);
assert.match(generatorSource, /ledgerItem \? \(ledgerItem\.dose \?\? null\) : \(item\.dose \?\? null\)/);
assert.match(generatorSource, /ledgerItem \? \(ledgerItem\.timing \?\? null\) : \(item\.timing \?\? null\)/);

const current = [
  { name: "Vitamin D", dose: "5000 IU", timing: "Daily at 10:30 AM" },
  { name: "Magnesium Glycinate", dose: "210 mg", timing: "Daily at 8:30 PM" },
  { name: "Magnesium Threonate", dose: "2000 mg", timing: "Daily at 8:30 AM and 10:30 AM" },
];
const validPersisted = current.map((item) => ({ ...item, is_current: true }));
assert.deepEqual(validateGeneratedHealthItemIntegrity(current, validPersisted), []);

const blankCurrentInstructions = [
  { name: "Pregnenolone", dose: null, timing: null },
  { name: "Collagen peptides", dose: null, timing: "Morning" },
];
const modelEnrichedItems = blankCurrentInstructions.map((item) => ({
  ...item,
  dose: item.dose ?? "Model-suggested dose",
  is_current: true,
}));
assert.deepEqual(
  validateGeneratedHealthItemIntegrity(blankCurrentInstructions, modelEnrichedItems),
  ["changed-current-dose:Pregnenolone", "changed-current-dose:Collagen peptides"],
  "Blank member instructions must remain blank rather than falling through to model guidance",
);

const parsedRoutine = parseMarkdownToItems([
  "## Current Stack",
  "",
  "| Current Item | Type | Purpose | Dosage | Timing |",
  "| --- | --- | --- | --- | --- |",
  "| Magnesium Glycinate | Supplement | Sleep | 210 mg | Evening |",
  "",
  "## Dosing & Notes",
  "",
  "- **Magnesium Glycinate** -- Your reported routine: 210 mg, evening.",
].join("\n"));
assert.equal(parsedRoutine.length, 1, "A current item and its routine note must remain one item");
assert.equal(parsedRoutine[0]?.name, "Magnesium Glycinate");
assert.doesNotMatch(parsedRoutine[0]?.name ?? "", /reported routine/i);

assert.deepEqual(
  validateGeneratedHealthItemIntegrity(current, [
    { ...validPersisted[0], dose: "5000mg" },
    validPersisted[1],
    validPersisted[2],
  ]),
  ["changed-current-dose:Vitamin D"],
  "A changed unit must block Blueprint persistence",
);

assert.deepEqual(
  validateGeneratedHealthItemIntegrity(current, validPersisted, [{ name: "Magnesium Bisglycinate" }]),
  ["current-item-proposed-as-new:Magnesium Bisglycinate"],
);

console.log("PR86 health-item integrity assertions passed.");
