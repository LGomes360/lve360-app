import assert from "node:assert/strict";

import { getMembershipPresentation } from "../lib/accountMembership.ts";

const complimentary = getMembershipPresentation({ tier: "premium", billingMode: "complimentary" });
assert.equal(complimentary.planName, "LVE360 Member");
assert.equal(complimentary.billingLabel, "Complimentary founder access");
assert.equal(complimentary.complimentary, true);
assert.equal(complimentary.stripeBilled, false);

const monthly = getMembershipPresentation({ tier: "premium", billingMode: "stripe_monthly" });
assert.equal(monthly.billingLabel, "Monthly billing");
assert.equal(monthly.stripeBilled, true);
assert.equal(monthly.complimentary, false);

const annual = getMembershipPresentation({ tier: "premium", billingMode: "stripe_annual" });
assert.equal(annual.billingLabel, "Annual billing");
assert.equal(annual.stripeBilled, true);

const free = getMembershipPresentation({ tier: "free", billingMode: "none" });
assert.equal(free.planName, "Free");
assert.equal(free.billingLabel, "No paid billing plan");
assert.equal(free.stripeBilled, false);

console.log("PR173 complimentary membership presentation checks passed.");
