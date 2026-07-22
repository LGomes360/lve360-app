"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { FileText, History, Loader2 } from "lucide-react";

import DashboardSnapshot from "@/components/dashboard/DashboardSnapshot";
import NextSteps from "@/components/dashboard/NextSteps";
import DailyLog from "@/components/dashboard/DailyLog";
import WeeklyGoal from "@/components/dashboard/WeeklyGoal";
import TodaysPlan from "@/components/dashboard/TodaysPlan";
import ProgressTracker from "@/components/dashboard/ProgressTracker";
import InsightsFeed from "@/components/dashboard/InsightsFeed";
import { getFriendlyFirstName } from "@/src/lib/displayName";

export default function DashboardClient({ activationStatus }: { activationStatus: "missing" | "draft" | "active" }) {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Get authed user
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) console.error("Auth fetch failed:", error.message);
      setUser(data?.user ?? null);
      setLoading(false);
    })();
  }, [supabase]);

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

  const username = getFriendlyFirstName(user);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        <header className="flex flex-col gap-4 rounded-2xl bg-[#041B2D] p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8DE5D5]">LVE360 Agent Dashboard</div>
            <h1 className="mt-1 text-3xl font-bold">Welcome back, {username}</h1>
            <p className="mt-1 text-sm text-white/75">Your plan, progress, and next best action in one place.</p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Report actions">
            <a href="/results" className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#041B2D] hover:bg-[#EAFBF8]">
              <FileText className="mr-2 h-4 w-4" /> View Blueprint
            </a>
            <a href="/dashboard/my-quiz" className="inline-flex items-center rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">
              <History className="mr-2 h-4 w-4" /> Reports & PDF
            </a>
          </nav>
        </header>

        {activationStatus !== "active" ? (
          <section className="rounded-2xl border border-[#9DCFC3] bg-[#EAFBF8] p-5 shadow-sm" aria-label="First-week setup">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Make your membership useful this week</p>
                <h2 className="mt-1 text-xl font-bold text-[#041B2D]">{activationStatus === "draft" ? "Finish setting up your first practice" : "Build your first focused week"}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Choose one repeatable lifestyle action, give it a cue, and define the version that counts on a hard day.</p>
              </div>
              <a href="/onboarding" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#08A88A] px-5 py-3 font-bold text-white hover:bg-[#078B74]">
                {activationStatus === "draft" ? "Continue setup" : "Set up my week"}
              </a>
            </div>
          </section>
        ) : null}

        {/* 1) Greeting & Snapshot */}
        <section aria-label="Snapshot and quick deltas">
          <DashboardSnapshot />
        </section>

        {/* 2) Coach-first: Next Steps (smart CTAs) */}
        <section id="next-steps" aria-label="Next steps">
          <NextSteps />
        </section>

        {/* 3) Weekly focus */}
        <section id="weekly-goal" aria-label="Weekly goal">
          <WeeklyGoal />
        </section>

        {/* 4) Today’s Plan */}
        <section id="todays-plan" aria-label="Today’s plan">
          <TodaysPlan />
        </section>

        {/* 5) Daily Check-in */}
        <section id="daily-log" aria-label="Daily check-in">
          <DailyLog />
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
