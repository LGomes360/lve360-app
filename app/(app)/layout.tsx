"use client";

import DashboardHeader from "@/components/DashboardHeader";
import { getUserAndTier } from "@/src/lib/getUserAndTier";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { tier } = await getUserAndTier();
  return (
    <>
      <Header tier={tier} /> {/* pass it down */}
      {children}
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
        <DashboardHeader />

        {/* Page content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
