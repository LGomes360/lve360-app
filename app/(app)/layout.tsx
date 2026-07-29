import React from "react";
import { redirect } from "next/navigation";
import { getUserAndTier } from "@/src/lib/getUserAndTier";
import DashboardHeader from "@/components/DashboardHeader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, tier } = await getUserAndTier(); // "free" | "trial" | "premium"
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] text-gray-900">
      <DashboardHeader tier={tier} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
