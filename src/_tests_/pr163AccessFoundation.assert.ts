import assert from "node:assert/strict";

import { resolveAccountAccess } from "../lib/accessModel.ts";
import { resolveProductMode } from "../lib/productModeConfig.ts";

assert.deepEqual(resolveAccountAccess({ tier: "free" }), {
  tier: "free",
  accessStatus: "blueprint_only",
  billingMode: "none",
  privateAccess: false,
  source: "legacy_tier",
});

assert.deepEqual(
  resolveAccountAccess({ tier: "premium", billing_interval: "annual", stripe_customer_id: "cus_test" }),
  {
    tier: "premium",
    accessStatus: "private_member",
    billingMode: "stripe_annual",
    privateAccess: true,
    source: "legacy_tier",
  },
);

const complimentary = resolveAccountAccess({
  tier: "free",
  access_status: "private_member",
  billing_mode: "complimentary",
});
assert.equal(complimentary.privateAccess, true);
assert.equal(complimentary.billingMode, "complimentary");

const suspendedPaid = resolveAccountAccess({
  tier: "premium",
  access_status: "suspended",
  billing_mode: "stripe_monthly",
});
assert.equal(suspendedPaid.privateAccess, false);
assert.equal(suspendedPaid.billingMode, "stripe_monthly");

const legacyMode = resolveProductMode({});
assert.equal(legacyMode.accessMode, "public_paid");
assert.equal(legacyMode.publicPricingEnabled, true);
assert.equal(legacyMode.billingCheckoutEnabled, true);
assert.equal(legacyMode.invitationIssuanceEnabled, false);
assert.equal(legacyMode.invitationsOperationallyUnlocked, false);

const lockedInviteMode = resolveProductMode({
  LVE360_ACCESS_MODE: "invite_only",
  LVE360_INVITATION_ISSUANCE_ENABLED: "true",
});
assert.equal(lockedInviteMode.publicPricingEnabled, false);
assert.equal(lockedInviteMode.publicSignupEnabled, false);
assert.equal(lockedInviteMode.billingCheckoutEnabled, false);
assert.equal(lockedInviteMode.invitationsOperationallyUnlocked, false);

const unlockedInviteMode = resolveProductMode({
  LVE360_ACCESS_MODE: "invite_only",
  LVE360_INVITATION_ISSUANCE_ENABLED: "true",
  LVE360_FOUNDER_USER_ID: "11111111-1111-4111-8111-111111111111",
});
assert.equal(unlockedInviteMode.invitationsOperationallyUnlocked, true);

assert.throws(
  () => resolveProductMode({ LVE360_INVITATION_ISSUANCE_ENABLED: "sometimes" }),
  /must be true or false/,
);

console.log("PR163 private access foundation behavior checks passed.");
