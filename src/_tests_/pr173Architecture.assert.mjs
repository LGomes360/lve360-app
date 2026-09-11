import assert from "node:assert/strict";
import fs from "node:fs";

const settings = fs.readFileSync("app/(app)/settings/page.tsx", "utf8");
const accountRoute = fs.readFileSync("app/api/account/route.ts", "utf8");
const portalRoute = fs.readFileSync("app/api/stripe/portal/route.ts", "utf8");

assert.match(accountRoute, /access_status, billing_mode, billing_interval, stripe_customer_id/);
assert.match(accountRoute, /billing_mode: access\.billingMode/);
assert.match(settings, /Complimentary founder access|membership\.billingLabel/);
assert.match(settings, /No payment required/);
assert.match(settings, /membership\.stripeBilled/);
assert.match(portalRoute, /access\.billingMode !== "stripe_monthly"/);
assert.match(portalRoute, /status: 403/);
assert.doesNotMatch(portalRoute, /customers\.list/);

console.log("PR173 complimentary billing architecture checks passed.");
