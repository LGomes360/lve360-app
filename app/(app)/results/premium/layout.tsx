import type { ReactNode } from "react";

import { requireTier } from "@/app/_auth/requireTier";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PremiumResultsLayout({ children }: { children: ReactNode }) {
  await requireTier(["premium", "trial"], { next: "/results/premium" });
  return children;
}
