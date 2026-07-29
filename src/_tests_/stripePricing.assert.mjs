import assert from "node:assert/strict";
import fs from "node:fs";

const catalog = fs.readFileSync("src/lib/stripePlanCatalog.ts", "utf8");
const checkout = fs.readFileSync("app/api/stripe/checkout/route.ts", "utf8");
const pricing = fs.readFileSync("app/pricing/page.tsx", "utf8");
const upgrade = fs.readFileSync("app/upgrade/UpgradeClient.tsx", "utf8");
const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

assert.match(catalog, /amount:\s*1_500[\s\S]*interval:\s*"month"/);
assert.match(catalog, /amount:\s*10_000[\s\S]*interval:\s*"year"/);
assert.match(catalog, /price\.active/);
assert.match(catalog, /price\.type !== "recurring"/);
assert.match(catalog, /price\.unit_amount !== expected\.amount/);
assert.match(catalog, /price\.recurring\?\.interval !== expected\.interval/);

assert.match(checkout, /stripe\.prices\.retrieve\(priceId\)/);
assert.match(checkout, /validateStripePrice\(plan, configuredPrice\)/);
assert.match(checkout, /status:\s*503/);
assert.match(checkout, /line_items:\s*\[\{ price: priceId, quantity: 1 \}\]/);

for (const source of [pricing, upgrade]) {
  assert.match(source, /\$15/);
  assert.match(source, /\$100/);
  assert.doesNotMatch(source, /\$9(?:\D|$)/);
}

assert.match(workflow, /STRIPE_PRICE_ANNUAL:\s*\$\{\{\s*secrets\.STRIPE_PRICE_ANNUAL\s*\}\}/);
assert.match(
  workflow,
  /VARS="[^"]*STRIPE_PRICE_PREMIUM[^"]*STRIPE_PRICE_ANNUAL[^"]*"/
);

console.log("Stripe pricing assertions passed.");
