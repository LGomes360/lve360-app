"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import ClientDashboard from "@/components/ClientDashboard";
import LongevityJourneyDashboard from "@/components/LongevityJourneyDashboard";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showGreeting, setShowGreeting] = useState(true);

  // 🔹 Fetch authenticated user
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) console.error("Auth fetch failed:", error.message);
      setUser(data?.user ?? null);
      setLoading(false);
    })();
  }, [supabase]);

  // 🔹 Gentle fade-in greeting
  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  // 🔹 Ensure user is provisioned in public.users
  useEffect(() => {
    fetch("/api/provision-user", { method: "POST" }).catch((err) =>
      console.error("Provision user failed:", err)
    );
  }, []);

  // -----------------------------
  // 🌀 Loading Spinner
  // -----------------------------
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  // -----------------------------
  // 🔒 Redirect if not logged in
  // -----------------------------
  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  // 🧠 Derive display name + ID
  const username =
    user.email?.split("@")[0]?.charAt(0).toUpperCase() +
      user.email?.split("@")[0]?.slice(1) || "Optimizer";
  const userId = user.id;

  // -----------------------------
  // 🎨 Main Dashboard Render
  // -----------------------------
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]">
      {/* DashboardHeader is rendered via (app)/layout.tsx */}

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Greeting Animation */}
        <AnimatePresence>
          {showGreeting && (
            <motion.h1
              key="greeting"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
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
        <section className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl ring-1 ring-purple-100 p-6 transition space-y-8">
          {/* Stack overview + insights */}
          <ClientDashboard userId={userId} />

          {/* Longevity goals section */}
          <LongevityJourneyDashboard userId={userId} />
        </section>
      </div>
    </main>
  );
}
