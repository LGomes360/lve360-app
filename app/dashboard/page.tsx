// app/dashboard/page.tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import ClientDashboard from "@/components/ClientDashboard";

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies });

  // --- Get session (null if not logged in) ---
  const {
    data: { user },
  } = await supabase.auth.getUser();
  console.log("Auth user email:", user?.email);
  // --- Case 1: Not logged in ---
  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 className="text-2xl font-semibold mb-4">Sign in to access your dashboard</h1>
        <a
          href="/login"
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Send me a Magic Link
        </a>
      </main>
    );
  }

  // --- Case 2: Logged in, check user tier ---
   const { data: profile, error } = await supabase
  .from("users") // 👈 remove the public. prefix
  .select("tier, stripe_subscription_status")
  .ilike("email", user.email ?? "")
  .maybeSingle();

  if (error) {
    console.error("Error fetching user tier:", error.message);
  }

  const tier = profile?.tier ?? "free";

  // --- Case 3: Logged in but Free tier ---
  if (tier !== "premium") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 className="text-2xl font-semibold mb-4">Upgrade to LVE360 Premium</h1>
        <p className="mb-6 text-gray-600">Unlock your personalized stack and exclusive features.</p>
        <a
          href="/pricing"
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Upgrade Now
        </a>
      </main>
    );
  }

  // --- Case 4: Logged in + Premium ---
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <ClientDashboard />
    </main>
  );
}
