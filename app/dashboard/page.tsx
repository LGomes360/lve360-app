import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import ClientDashboard from "@/components/ClientDashboard";

// ---------- SERVER SIDE: Auth + Tier Guard ----------
async function getUserProfile() {
  const supabase = createServerComponentClient({ cookies });

  // Get the current auth user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/pricing");
  }

  // Look up the user’s tier from your custom users table by email
  const { data: profile, error } = await supabase
    .from("users")
    .select("tier")
    .eq("email", user.email)   // ✅ switched from id → email
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

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <ClientDashboard />
    </main>
  );
}
