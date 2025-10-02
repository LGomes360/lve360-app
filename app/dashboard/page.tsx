import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";

// Wrapper to split server and client concerns
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

  // Render a client-side wrapper that can read query params
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <ClientDashboard />
    </div>
  );
}

// Client-side part for welcome banner + dashboard
"use client";
import { useSearchParams } from "next/navigation";

function ClientDashboard() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");

  return (
    <>
      {success && (
        <div className="bg-green-100 border border-green-300 text-green-800 p-4 mb-6 rounded-lg shadow-sm text-center">
          🎉 Welcome to Premium! Your subscription is now active.
        </div>
      )}
      <LongevityJourneyDashboard />
    </>
  );
}
