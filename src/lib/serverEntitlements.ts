import "server-only";

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "./supabaseAdmin";

export type AccountTier = "free" | "trial" | "premium";

export type RequestEntitlement = {
  user: User | null;
  tier: AccountTier;
  paid: boolean;
};

function normalizeTier(value: unknown): AccountTier {
  return value === "premium" || value === "trial" ? value : "free";
}

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
    return { user: null, tier: "free", paid: false };
  }

  const { data: profile, error: profileError } = await getSupabaseAdmin()
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[entitlements] profile lookup failed", {
      userId: user.id,
      message: profileError.message,
    });
  }

  const tier = normalizeTier(profile?.tier);
  return { user, tier, paid: isPaidTier(tier) };
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
