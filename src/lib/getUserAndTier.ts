// src/lib/getUserAndTier.ts
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export async function getUserAndTier() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, tier: "free" as const };

  const { data, error } = await supabase
    .from("users")
    .select("tier")
    .eq("email", user.email!)
    .maybeSingle();

  return { user, tier: (data?.tier ?? "free") as "free"|"trial"|"premium" };
}
