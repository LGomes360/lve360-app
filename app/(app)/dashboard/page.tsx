"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2 } from "lucide-react";

import DashboardSnapshot from "@/components/dashboard/DashboardSnapshot";
import NextSteps from "@/components/dashboard/NextSteps";
import DailyLog from "@/components/dashboard/DailyLog";
import WeeklyGoal from "@/components/dashboard/WeeklyGoal";
import TodaysPlan from "@/components/dashboard/TodaysPlan";
import ProgressTracker from "@/components/dashboard/ProgressTracker";
import InsightsFeed from "@/components/dashboard/InsightsFeed";

export default function DashboardPage() {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showGreeting, setShowGreeting] = useState(true);

  // Get authed user
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) console.error("Auth fetch failed:", error.message);
      setUser(data?.user ?? null);
      setLoading(false);
    })();
  }, [supabase]);

  // Soft fade greeting
  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 1600);
    return () => clearTimeout(timer);
  }, []);

  // Ensure user exists in public.users
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Greeting splash */}
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
        <section aria-label="Snapshot and quick deltas">
          <DashboardSnapshot />
        </section>

        {/* 2) Coach-first: Next Steps (smart CTAs) */}
        <section id="next-steps" aria-label="Next steps">
          <NextSteps />
        </section>

        {/* 3) Daily Check-in */}
        <section id="daily-log" aria-label="Daily check-in">
          <DailyLog />
        </section>

        {/* 4) Weekly Goal */}
        <section id="weekly-goal" aria-label="Weekly goal">
          <WeeklyGoal />
        </section>

        {/* 5) Today’s Plan (AM/PM checklist + manager) */}
        <section id="todays-plan" aria-label="Today’s plan">
          <TodaysPlan />
        </section>

        {/* 6) Progress Tracker (mini charts) */}
        <section id="progress" aria-label="Progress tracker">
          <ProgressTracker />
        </section>

        {/* 7) Insights & Tweaks (AI summaries) */}
        <section id="insights" aria-label="AI insights">
          <InsightsFeed />
        </section>
      </div>
    </main>
  );
}
