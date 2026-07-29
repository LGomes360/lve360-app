import type Stripe from "stripe";

export type MembershipPlan = "monthly" | "annual";

type PlanDefinition = {
  amount: number;
  currency: "usd";
  interval: "month" | "year";
  label: string;
};

export const MEMBERSHIP_PLANS: Record<MembershipPlan, PlanDefinition> = {
  monthly: {
    amount: 1_500,
    currency: "usd",
    interval: "month",
    label: "$15/month",
  },
  annual: {
    amount: 10_000,
    currency: "usd",
    interval: "year",
    label: "$100/year",
  },
};

export function isMembershipPlan(value: unknown): value is MembershipPlan {
  return value === "monthly" || value === "annual";
}

export function validateStripePrice(
  plan: MembershipPlan,
  price: Stripe.Price
): string[] {
  const expected = MEMBERSHIP_PLANS[plan];
  const failures: string[] = [];

  if (!price.active) failures.push("price is inactive");
  if (price.type !== "recurring") failures.push("price is not recurring");
  if (price.currency.toLowerCase() !== expected.currency) {
    failures.push(`currency is ${price.currency}`);
  }
  if (price.unit_amount !== expected.amount) {
    failures.push(`amount is ${price.unit_amount ?? "unset"}`);
  }
  if (price.recurring?.interval !== expected.interval) {
    failures.push(`interval is ${price.recurring?.interval ?? "unset"}`);
  }

  return failures;
}
