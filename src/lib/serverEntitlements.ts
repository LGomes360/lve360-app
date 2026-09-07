import "server-only";

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  type AccessStatus,
  type AccountTier,
  type BillingMode,
} from "./accessModel";
import { loadPrivateAccess } from "./privateAccess";

export type { AccountTier } from "./accessModel";

export type RequestEntitlement = {
  user: User | null;
  tier: AccountTier;
  paid: boolean;
  privateAccess: boolean;
  accessStatus: AccessStatus;
  billingMode: BillingMode;
};

export function isPaidTier(tier: unknown): tier is "trial" | "premium" {
  return tier === "premium" || tier === "trial";
}

export function stackContainsPremiumPayload(sections: unknown): boolean {
  if (!sections || typeof sections !== "object") return false;
  return (sections as { mode?: unknown }).mode === "premium";
}

export async function getRequestEntitlement(): Promise<RequestEntitlement> {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return {
      user: null,
      tier: "free",
      paid: false,
      privateAccess: false,
      accessStatus: "blueprint_only",
      billingMode: "none",
    };
  }

  let access = null;
  try {
    access = await loadPrivateAccess(user.id);
  } catch (profileError) {
    console.error("[entitlements] profile lookup failed", {
      userId: user.id,
      message: profileError instanceof Error ? profileError.message : "unknown_error",
    });
  }

  const tier = access?.tier ?? "free";
  return {
    user,
    tier,
    paid: isPaidTier(tier),
    privateAccess: access?.privateAccess ?? false,
    accessStatus: access?.accessStatus ?? "blueprint_only",
    billingMode: access?.billingMode ?? "none",
  };
}

export async function requirePrivateAccessApi(): Promise<
  | { ok: true; user: User; tier: AccountTier; accessStatus: "private_member"; billingMode: BillingMode }
  | { ok: false; response: NextResponse }
> {
  const entitlement = await getRequestEntitlement();
  if (!entitlement.user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }
  if (!entitlement.privateAccess) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "private_access_required" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    user: entitlement.user,
    tier: entitlement.tier,
    accessStatus: "private_member",
    billingMode: entitlement.billingMode,
  };
}

export async function requirePaidApi(): Promise<
  | { ok: true; user: User; tier: "trial" | "premium" }
  | { ok: false; response: NextResponse }
> {
  const entitlement = await getRequestEntitlement();
  if (!entitlement.user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }
  if (!isPaidTier(entitlement.tier)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "premium_required" }, { status: 403 }),
    };
  }
  return { ok: true, user: entitlement.user, tier: entitlement.tier };
}

export async function authorizeStackPayload(stack: {
  user_id?: string | null;
  sections?: unknown;
}): Promise<
  | { ok: true }
  | { ok: false; response: NextResponse }
> {
  if (!stackContainsPremiumPayload(stack.sections)) return { ok: true };

  const entitlement = await getRequestEntitlement();
  if (!entitlement.user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }
  if (!entitlement.paid || !stack.user_id || entitlement.user.id !== stack.user_id) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "premium_required" }, { status: 403 }),
    };
  }
  return { ok: true };
}
