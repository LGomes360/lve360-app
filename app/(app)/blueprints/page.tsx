import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

import { getUserAndTier } from "@/src/lib/getUserAndTier";

import BlueprintsClient from "./BlueprintsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const { user, tier } = await getUserAndTier();
  if (!user) redirect("/login");

  const supabase = createServerComponentClient({ cookies });
  const { data: stacks, error } = await supabase
    .from("stacks")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) console.error("[blueprints] library lookup failed", error.message);

  return (
    <BlueprintsClient
      stacks={(stacks ?? []) as any}
      paid={tier === "premium" || tier === "trial"}
    />
  );
}
