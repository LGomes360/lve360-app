///app/dashboard/page.tsx//
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import DashboardClientView from "./DashboardClientView"; // 👈 we'll create this next
import DashboardHeader from "@/components/DashboardHeader";

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies });

  // --- Get session (null if not logged in) ---
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] p-6">
        <h1 className="text-3xl font-extrabold bg-gradient-to-r from-[#041B2D] via-[#06C1A0] to-purple-600 bg-clip-text text-transparent mb-4">
          Sign in to access your dashboard
        </h1>
        <a
          href="/login"
          className="px-5 py-2.5 bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition"
        >
          Log In
        </a>
      </main>
    );
  }

  // --- Case 2: Logged in, check user tier ---
  const emailNormalized = (user.email ?? "").trim().toLowerCase();
  const { data: profile, error } = await supabase
    .schema("public")
    .from("users")
    .select("tier, stripe_subscription_status")
    .eq("email", emailNormalized)
    .maybeSingle();

  if (error) console.error("Error fetching user tier:", error.message);
  const tier = profile?.tier ?? "free";

  // --- Case 3: Logged in but Free tier ---
  if (tier !== "premium") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] p-6 text-center">
        <h1 className="text-3xl font-extrabold bg-gradient-to-r from-[#041B2D] via-[#06C1A0] to-purple-600 bg-clip-text text-transparent mb-4">
          Upgrade to LVE360 Premium
        </h1>
        <p className="mb-6 text-gray-600 max-w-md">
          Unlock your personalized supplement stack, weekly tweaks, and exclusive
          insights curated just for you.
        </p>
        <a
          href="/pricing"
          className="px-6 py-2.5 bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition"
        >
          Upgrade Now
        </a>
      </main>
    );
  }

  // --- Case 4: Logged in + Premium ---
return (
  <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]">
    <DashboardHeader />
    <DashboardClientView
      username={user.email?.split("@")[0] || "Optimizer"}
      userId={user.id}
    />
  </main>
);
