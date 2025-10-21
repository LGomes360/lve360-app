import React from "react";
import { getUserAndTier } from "@/src/lib/getUserAndTier";
import DashboardHeader from "@/components/DashboardHeader"; // adjust path if your header lives elsewhere

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { tier } = await getUserAndTier(); // "free" | "trial" | "premium"

  return (
    <html lang="en">
      <body
        className="
          min-h-screen 
          bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]
          text-gray-900
          flex flex-col
        "
      >
        {/* Shared dashboard header for all authenticated pages */}
        <DashboardHeader tier={tier} />

        {/* Page content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
