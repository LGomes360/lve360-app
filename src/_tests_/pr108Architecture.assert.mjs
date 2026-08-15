import assert from "node:assert/strict";
import fs from "node:fs";

const contract = fs.readFileSync("src/lib/memberContext.ts", "utf8");
const loader = fs.readFileSync("src/lib/memberContextData.ts", "utf8");

assert.match(contract, /MEMBER_CONTEXT_VERSION/);
assert.match(contract, /medications:[\s\S]*hormones:[\s\S]*supplements:[\s\S]*endocrineActiveSupplements:/);
assert.match(contract, /provenance/);
assert.match(contract, /contextFreshness/);
assert.match(loader, /import "server-only"/);
assert.match(loader, /getCurrentRegimen/);
assert.match(loader, /getCurrentBlueprintContext/);
assert.match(loader, /weekly_experiment_reviews/);
assert.match(loader, /daily_practice_completions/);
assert.doesNotMatch(loader, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/, "The canonical context loader must remain read-only.");

console.log("PR108 canonical member context architecture checks passed.");
