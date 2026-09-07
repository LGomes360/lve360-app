import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { resolveAccountAccess, type AccountAccess } from "./accessModel";
import { getSupabaseAdmin } from "./supabaseAdmin";

const CANONICAL_ACCESS_COLUMNS =
  "tier, access_status, billing_mode, billing_interval, stripe_customer_id";

function isPreMigrationColumnError(error: PostgrestError): boolean {
  return error.code === "42703"
    || error.code === "PGRST204"
    || /access_status|billing_mode/i.test(error.message);
}

export async function loadPrivateAccess(userId: string): Promise<AccountAccess | null> {
  const admin = getSupabaseAdmin();
  const canonical = await admin
    .from("users")
    .select(CANONICAL_ACCESS_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (!canonical.error) {
    return canonical.data ? resolveAccountAccess(canonical.data) : null;
  }

  if (!isPreMigrationColumnError(canonical.error)) {
    throw canonical.error;
  }

  // Temporary deploy-order protection. Preview/Production may receive the app
  // build shortly before the additive migration is applied.
  console.warn("[private-access] canonical columns unavailable; using legacy tier fallback", {
    userId,
    code: canonical.error.code,
  });
  const legacy = await admin
    .from("users")
    .select("tier, billing_interval, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  if (legacy.error) throw legacy.error;

  return legacy.data ? resolveAccountAccess(legacy.data) : null;
}
