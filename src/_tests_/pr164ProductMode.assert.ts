import assert from "node:assert/strict";

import { resolveProductMode } from "../lib/productModeConfig.ts";

const currentDefault = resolveProductMode({});
assert.equal(currentDefault.accessMode, "public_paid");
assert.equal(currentDefault.publicPricingEnabled, true);
assert.equal(currentDefault.publicSignupEnabled, true);
assert.equal(currentDefault.billingCheckoutEnabled, true);

const inviteOnly = resolveProductMode({ LVE360_ACCESS_MODE: "invite_only" });
assert.equal(inviteOnly.publicPricingEnabled, false);
assert.equal(inviteOnly.publicSignupEnabled, false);
assert.equal(inviteOnly.billingCheckoutEnabled, false);

const failClosed = resolveProductMode({
  LVE360_ACCESS_MODE: "invite_only",
  LVE360_PUBLIC_PRICING_ENABLED: "true",
  LVE360_PUBLIC_SIGNUP_ENABLED: "true",
  LVE360_BILLING_CHECKOUT_ENABLED: "true",
});
assert.equal(failClosed.publicPricingEnabled, false, "invite-only mode must hide pricing even after an inconsistent deployment setting");
assert.equal(failClosed.publicSignupEnabled, false, "invite-only mode must stop public account creation even after an inconsistent deployment setting");
assert.equal(failClosed.billingCheckoutEnabled, false, "invite-only mode must stop checkout even after an inconsistent deployment setting");

assert.throws(
  () => resolveProductMode({ LVE360_ACCESS_MODE: "private-ish" }),
  /must be public_paid or invite_only/,
);

console.log("PR164 product-mode assertions passed");
