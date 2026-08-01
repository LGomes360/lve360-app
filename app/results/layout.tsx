import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getUserAndTier } from "@/src/lib/getUserAndTier";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicResultsLayout({ children }: { children: ReactNode }) {
  const { user, tier } = await getUserAndTier();
  if (user && (tier === "premium" || tier === "trial")) {
    redirect("/results/premium");
  }
  return children;
}
