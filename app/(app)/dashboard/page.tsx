"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2 } from "lucide-react";

import DashboardSnapshot from "@/components/dashboard/DashboardSnapshot";
import TodaysPlan from "@/components/dashboard/TodaysPlan";
import ProgressTracker from "@/components/dashboard/ProgressTracker";
import InsightsFeed from "@/components/dashboard/InsightsFeed";
import NextSteps from "@/components/dashboard/NextSteps";

export default function DashboardPage() {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showGreeting, setShowGreeting] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) console.error("Auth fetch failed:", error.message);
      setUser(data?.user ?? null);
      setLoading(false);
    })();
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 1600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetch("/api/provision-user", { method: "POST" }).catch((err) =>
      console.error("Provision user failed:", err)
    );
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const username =
    user.email?.split("@")[0]?.charAt(0).toUpperCase() +
      user.email?.split("@")[0]?.slice(1) || "Optimizer";
  const userId = user.id;

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Soft greeting splash */}
        <AnimatePresence>
          {showGreeting && (
            <motion.h1
              key="greeting"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-4xl font-extrabold text-center mb-2"
            >
              Welcome back,{" "}
              <span className="bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] bg-clip-text text-transparent">
                {username}
              </span>{" "}
              👋
            </motion.h1>
          )}
        </AnimatePresence>

        {/* 1) Greeting & Snapshot */}
        <DashboardSnapshot />

        {/* 2) Today’s Plan (AM/PM checklist + manager) */}
        <TodaysPlan />

        {/* 3) Progress Tracker (mini charts) */}
        <ProgressTracker />

        {/* 4) Insights & Tweaks (AI summaries) */}
        <InsightsFeed />

        {/* 5) Next Steps (smart CTAs) */}
        <NextSteps />
      </div>
    </main>
  );
}
