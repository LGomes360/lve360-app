// app/_auth/requireTier.ts
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export type Tier = "free" | "trial" | "premium";

/**
 * Usage:
 *   // premium-only page:
 *   await requireTier(["premium"]);
 *   // trial or premium:
 *   await requireTier(["trial", "premium"]);
 *
 *   // optional: preserve where to go after login
 *   await requireTier(["premium"], { next: "/dashboard" });
 */
export async function requireTier(allowed: Tier[], opts?: { next?: string }) {
  const supabase = createServerComponentClient({ cookies });

  // 1) Must be signed in
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = opts?.next ? `?next=${encodeURIComponent(opts.next)}` : "";
    redirect(`/login${next}`);
  }

  // 2) Fetch profile by *id* (never by email)
  let { data: me } = await supabase
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  // 3) If missing, self-provision (avoids race to /upgrade on first login)
  if (!me) {
    await supabase
      .from("users")
      .upsert(
        { id: user.id, email: user.email ?? "", tier: "free" },
        { onConflict: "id" }
      );

    const refetch = await supabase
      .from("users")
      .select("tier")
      .eq("id", user.id)
      .maybeSingle();
    me = refetch.data ?? null;
  }

  // 4) Current tier
  let tier: Tier = (me?.tier as Tier) ?? "free";

  // 5) Gate with a brief re-check to absorb write/read lag after Stripe
  if (!allowed.includes(tier)) {
    // tiny debounce and re-read once
    await new Promise((s) => setTimeout(s, 300));
    const again = await supabase
      .from("users")
      .select("tier")
      .eq("id", user.id)
      .maybeSingle();

    tier = ((again.data?.tier as Tier) ?? tier) as Tier;

    if (!allowed.includes(tier)) {
      // Not yet allowed → send to upgrade
      redirect("/upgrade");
    }
  }

  return { user, tier };
}
