"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import DashboardHeader from "@/components/DashboardHeader";
import ClientDashboard from "@/components/ClientDashboard";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showGreeting, setShowGreeting] = useState(true);

  // -----------------------------
  // Fetch authenticated user
  // -----------------------------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ?? null);
      setLoading(false);
    })();
  }, []);

  // -----------------------------
  // Fade-in greeting
  // -----------------------------
  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  // -----------------------------
  // Provision user in public.users table
  // -----------------------------
  useEffect(() => {
    fetch("/api/provision-user", { method: "POST" }).catch((err) =>
      console.error("Provision user failed:", err)
    );
  }, []);

  // -----------------------------
  // Loading State
  // -----------------------------
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  // -----------------------------
  // If not logged in → redirect
  // -----------------------------
  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const username =
    user.email?.split("@")[0]?.charAt(0).toUpperCase() +
      user.email?.split("@")[0]?.slice(1) || "Optimizer";
  const userId = user.id;

  // -----------------------------
  // RENDER DASHBOARD
  // -----------------------------
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]">
      <DashboardHeader />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Animated greeting */}
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

        {/* Main Dashboard Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl ring-1 ring-purple-100 p-6 transition space-y-8">
          {/* ClientDashboard = stack summary + AI insights */}
          <ClientDashboard userId={userId} />

          {/* Longevity goals + logging */}
          <LongevityJourneyDashboard userId={userId} />
        </div>
      </div>
    </main>
  );
}
