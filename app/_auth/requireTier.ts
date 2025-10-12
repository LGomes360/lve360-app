// app/_auth/requireTier.ts
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function requireTier(allowed: Array<"premium" | "trial">) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  const tier = me?.tier ?? "free";
  if (!allowed.includes(tier as any)) redirect("/upgrade");

  return { user, tier };
}
