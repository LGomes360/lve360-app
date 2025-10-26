// app/_auth/requireTier.ts
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type Tier = "free" | "trial" | "premium";

/**
 * Usage:
 *   // premium-only page:
 *   await requireTier(["premium"]);
 *   // trial or premium:
 *   await requireTier(["trial", "premium"]);
 */
export async function requireTier(allowed: Tier[]) {
  const supabase = createServerComponentClient({ cookies });

  // 1) Must be signed in
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 2) Fetch profile by *id* (never by email)
  let { data: me, error } = await supabase
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  // 3) If missing, self-provision (avoids race-to-/upgrade)
  if (!me) {
    await supabase
      .from("users")
      .upsert({ id: user.id, email: user.email ?? "", tier: "free" }, { onConflict: "id" });

    // re-fetch after upsert
    const refetch = await supabase
      .from("users")
      .select("tier")
      .eq("id", user.id)
      .maybeSingle();
    me = refetch.data ?? null;
  }

  const tier: Tier = (me?.tier as Tier) ?? "free";

  // 4) Gate
  if (!allowed.includes(tier)) {
    // If you want trial to count as premium in some places, pass both in `allowed`.
    redirect("/upgrade");
  }

  return { user, tier };
}
