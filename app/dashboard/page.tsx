import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";

// ---------- SERVER SIDE: Auth + Tier Guard ----------
async function getUserProfile() {
  const supabase = createServerComponentClient({ cookies });

  // Get current auth user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/pricing");
  }

  // Check tier in users table
  const { data: profile, error } = await supabase
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user tier:", error.message);
    redirect("/pricing");
  }

  if (!profile || profile.tier !== "premium") {
    redirect("/pricing");
  }

  return { user, profile };
}

export default async function DashboardPage() {
  await getUserProfile();

  // Render client-side part
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <ClientDashboard />
    </div>
  );
}

// ---------- CLIENT SIDE: Banner + Dashboard ----------
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

function ClientDashboard() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const [showBanner, setShowBanner] = useState(!!success);

  // Auto-hide banner after 5 seconds
  useEffect(() => {
    if (showBanner) {
      const timer = setTimeout(() => setShowBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showBanner]);

  return (
    <>
      {showBanner && (
        <div className="bg-green-100 border border-green-300 text-green-800 p-4 mb-6 rounded-lg shadow-sm text-center animate-fade-in">
          🎉 Welcome to Premium! Your subscription is now active.
        </div>
      )}

      <LongevityJourneyDashboard />
    </>
  );
}
