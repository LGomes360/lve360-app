import type { BillingMode } from "./accessModel";

export type MembershipPresentation = {
  planName: string;
  billingLabel: string;
  stripeBilled: boolean;
  complimentary: boolean;
};

export function getMembershipPresentation(input: {
  tier: string;
  billingMode: BillingMode;
}): MembershipPresentation {
  const stripeBilled = input.billingMode === "stripe_monthly" || input.billingMode === "stripe_annual";
  const complimentary = input.billingMode === "complimentary";

  return {
    planName: complimentary
      ? "LVE360 Member"
      : input.tier === "premium"
        ? "LVE360 Member"
        : input.tier === "trial"
          ? "LVE360 Trial"
          : "Free",
    billingLabel: complimentary
      ? "Complimentary founder access"
      : input.billingMode === "stripe_annual"
        ? "Annual billing"
        : input.billingMode === "stripe_monthly"
          ? "Monthly billing"
          : "No paid billing plan",
    stripeBilled,
    complimentary,
  };
}
