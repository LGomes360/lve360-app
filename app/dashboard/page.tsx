"use client";

import { useEffect, useState } from "react";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { motion, AnimatePresence } from "framer-motion";
import ClientDashboard from "@/components/ClientDashboard";
import DashboardHeader from "@/components/DashboardHeader";

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

  console.log("🔍 Profile lookup result:", profile, "error:", error);
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
    <DashboardClientView username={user.email?.split("@")[0] || "Optimizer"} />
  );
}

/* ---------- CLIENT COMPONENT FOR INTERACTIVITY ---------- */
function DashboardClientView({ username }: { username: string }) {
  const [showGreeting, setShowGreeting] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 4000); // Hide after 4s
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]">
      {/* Premium Header */}
      <DashboardHeader />

      {/* Main Dashboard Area */}
      <div className="max-w-6xl mx-auto p-6">
        <AnimatePresence>
          {showGreeting && (
            <motion.h1
              key="greeting"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
              className="text-4xl font-extrabold text-center mb-8"
            >
              Welcome back,{" "}
              <span className="bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] bg-clip-text text-transparent">
                {username}
              </span>{" "}
              👋
            </motion.h1>
          )}
        </AnimatePresence>

        {/* Dashboard Body */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl ring-1 ring-purple-100 p-6 transition">
          <ClientDashboard />
        </div>
      </div>
    </main>
  );
}
