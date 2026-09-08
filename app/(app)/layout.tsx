import React from "react";
import { redirect } from "next/navigation";
import { getUserAndTier } from "@/src/lib/getUserAndTier";
import { loadPrivateAccess } from "@/src/lib/privateAccess";
import { getProductMode, isFounderUser } from "@/src/lib/productMode";
import DashboardHeader from "@/components/DashboardHeader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, tier } = await getUserAndTier();
  if (!user) redirect("/login");

  const mode = getProductMode();
  if (mode.accessMode === "invite_only" && !isFounderUser(user.id)) {
    const access = await loadPrivateAccess(user.id);
    if (!access?.privateAccess) redirect("/request-invitation?reason=access_required");
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] text-gray-900 print:block print:min-h-0 print:bg-white">
      <div className="print:hidden"><DashboardHeader tier={tier} /></div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 print:max-w-none print:p-0 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
