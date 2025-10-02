import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies });

  // Get the current auth user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not logged in → send to pricing
    redirect("/pricing");
  }

  // Look up the user’s tier from your users table
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
    // Free users → redirect to pricing
    redirect("/pricing");
  }

  // Premium user → render the dashboard
  return <LongevityJourneyDashboard />;
}
