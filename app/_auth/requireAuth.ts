// app/_auth/requireAuth.ts
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * Ensures a user session exists. Does NOT check tier.
 * Use this for pages that should be available to all signed-in users.
 */
export async function requireAuth() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { user };
}
