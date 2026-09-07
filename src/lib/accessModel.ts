export type AccountTier = "free" | "trial" | "premium";

export type AccessStatus = "blueprint_only" | "private_member" | "suspended";

export type BillingMode =
  | "none"
  | "complimentary"
  | "stripe_monthly"
  | "stripe_annual";

export type AccountAccessRecord = {
  tier?: unknown;
  access_status?: unknown;
  billing_mode?: unknown;
  billing_interval?: unknown;
  stripe_customer_id?: unknown;
};

export type AccountAccess = {
  tier: AccountTier;
  accessStatus: AccessStatus;
  billingMode: BillingMode;
  privateAccess: boolean;
  source: "canonical" | "legacy_tier";
};

export function normalizeTier(value: unknown): AccountTier {
  return value === "premium" || value === "trial" ? value : "free";
}

export function isLegacyPaidTier(tier: unknown): tier is "trial" | "premium" {
  return tier === "premium" || tier === "trial";
}

function isAccessStatus(value: unknown): value is AccessStatus {
  return value === "blueprint_only" || value === "private_member" || value === "suspended";
}

function isBillingMode(value: unknown): value is BillingMode {
  return value === "none"
    || value === "complimentary"
    || value === "stripe_monthly"
    || value === "stripe_annual";
}

function legacyBillingMode(record: AccountAccessRecord, tier: AccountTier): BillingMode {
  if (!isLegacyPaidTier(tier)) return "none";
  if (typeof record.stripe_customer_id !== "string" || !record.stripe_customer_id.trim()) {
    return "complimentary";
  }
  return record.billing_interval === "annual" ? "stripe_annual" : "stripe_monthly";
}

/**
 * Resolve the canonical private-access decision without conflating it with
 * payment state. Legacy tier fallback keeps deployments safe while the additive
 * migration is being applied; it can be removed after the migration is verified.
 */
export function resolveAccountAccess(record: AccountAccessRecord | null | undefined): AccountAccess {
  const source = isAccessStatus(record?.access_status) ? "canonical" : "legacy_tier";
  const tier = normalizeTier(record?.tier);
  const accessStatus = source === "canonical"
    ? record!.access_status as AccessStatus
    : isLegacyPaidTier(tier)
      ? "private_member"
      : "blueprint_only";
  const billingMode = isBillingMode(record?.billing_mode)
    ? record.billing_mode
    : legacyBillingMode(record ?? {}, tier);

  return {
    tier,
    accessStatus,
    billingMode,
    privateAccess: accessStatus === "private_member",
    source,
  };
}
