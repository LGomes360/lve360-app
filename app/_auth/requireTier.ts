// app/_auth/requireTier.ts
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export type Tier = "free" | "trial" | "premium";

export async function requireTier(allowed: Tier[], opts?: { next?: string }) {
  const supabase = createServerComponentClient({ cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = opts?.next ? `?next=${encodeURIComponent(opts.next)}` : "";
    console.log("[requireTier] no user → /login", { allowed });
    redirect(`/login${next}`);
  }

  let { data: me, error } = await supabase
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[requireTier] users read error:", { userId: user.id, error });
  }

  if (!me) {
    console.warn("[requireTier] no profile → upsert free", { userId: user.id, email: user.email });
    await supabase
      .from("users")
      .upsert({ id: user.id, email: user.email ?? "", tier: "free" }, { onConflict: "id" });
    const again = await supabase
      .from("users")
      .select("tier")
      .eq("id", user.id)
      .maybeSingle();
    me = again.data ?? null;
  }

  let tier: Tier = (me?.tier as Tier) ?? "free";
  console.log("[requireTier] decision start:", { userId: user.id, tier, allowed });

  if (!allowed.includes(tier)) {
    await new Promise((s) => setTimeout(s, 300));
    const refetch = await supabase
      .from("users")
      .select("tier")
      .eq("id", user.id)
      .maybeSingle();
    const t2 = (refetch.data?.tier as Tier) ?? tier;
    console.log("[requireTier] recheck:", { userId: user.id, before: tier, after: t2, allowed });

    if (!allowed.includes(t2)) {
      console.warn("[requireTier] redirect → /upgrade", { userId: user.id, finalTier: t2, allowed });
      redirect("/upgrade");
    }

    tier = t2;
  }

  console.log("[requireTier] access granted:", { userId: user.id, tier });
  return { user, tier };
}
