export type PublicAccessMode = "public_paid" | "invite_only";

export type ProductMode = Readonly<{
  accessMode: PublicAccessMode;
  publicPricingEnabled: boolean;
  publicSignupEnabled: boolean;
  billingCheckoutEnabled: boolean;
  invitationIssuanceEnabled: boolean;
  founderUserId: string | null;
  invitationsOperationallyUnlocked: boolean;
}>;

type ProductModeEnvironment = Record<string, string | undefined>;

function readBoolean(
  env: ProductModeEnvironment,
  name: string,
  fallback: boolean,
): boolean {
  const value = env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`${name} must be true or false`);
}

function readAccessMode(env: ProductModeEnvironment): PublicAccessMode {
  const value = env.LVE360_ACCESS_MODE?.trim().toLowerCase();
  if (!value) return "public_paid";
  if (value === "public_paid" || value === "invite_only") return value;
  throw new Error("LVE360_ACCESS_MODE must be public_paid or invite_only");
}

function readFounderUserId(env: ProductModeEnvironment): string | null {
  const value = env.LVE360_FOUNDER_USER_ID?.trim();
  if (!value) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("LVE360_FOUNDER_USER_ID must be a valid UUID");
  }
  return value.toLowerCase();
}

export function resolveProductMode(env: ProductModeEnvironment): ProductMode {
  const accessMode = readAccessMode(env);
  const inviteOnly = accessMode === "invite_only";
  const founderUserId = readFounderUserId(env);
  const invitationIssuanceEnabled = readBoolean(
    env,
    "LVE360_INVITATION_ISSUANCE_ENABLED",
    false,
  );

  return Object.freeze({
    accessMode,
    publicPricingEnabled: readBoolean(env, "LVE360_PUBLIC_PRICING_ENABLED", !inviteOnly),
    publicSignupEnabled: readBoolean(env, "LVE360_PUBLIC_SIGNUP_ENABLED", !inviteOnly),
    billingCheckoutEnabled: readBoolean(env, "LVE360_BILLING_CHECKOUT_ENABLED", !inviteOnly),
    invitationIssuanceEnabled,
    founderUserId,
    invitationsOperationallyUnlocked:
      inviteOnly && invitationIssuanceEnabled && founderUserId !== null,
  });
}
