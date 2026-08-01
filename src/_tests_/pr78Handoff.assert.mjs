import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const premiumPage = read("app/(app)/results/premium/page.tsx");
for (const forbidden of ["$15/month", "Upgrade to Premium", "Generate Free Report", "Log in"]) {
  assert.doesNotMatch(premiumPage, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
}
assert.match(premiumPage, /Your Blueprint is being prepared/);
assert.match(premiumPage, /Retry generation/);
assert.match(premiumPage, /\/blueprints\/\$\{encodeURIComponent\(stackId\)\}/);
assert.match(premiumPage, /\/api\/blueprint-handoff/);

const handoffRoute = read("app/api/blueprint-handoff/route.ts");
assert.match(handoffRoute, /requirePaidApi/);
assert.match(handoffRoute, /eq\("user_id", entitlement\.user\.id\)/);
assert.match(handoffRoute, /status: stack \? "ready" : "generating"/);

const publicResultsLayout = read("app/results/layout.tsx");
assert.match(publicResultsLayout, /tier === "premium" \|\| tier === "trial"/);
assert.match(publicResultsLayout, /redirect\("\/results\/premium"\)/);

const webhook = read("app/api/tally-webhook/route.ts");
const generator = read("app/api/generate-stack/route.ts");
assert.match(webhook, /Authorization: `Bearer \$\{internalSecret\}`/);
assert.match(webhook, /after\(async \(\) =>/);
assert.match(generator, /trustedInternalRequest/);
assert.match(generator, /isPaidTier\(tier\) && !trustedInternalRequest/);

const chrome = read("src/components/PublicSiteChrome.tsx");
assert.match(chrome, /"\/results\/premium"/);

console.log("PR78 paid post-intake handoff assertions passed");
