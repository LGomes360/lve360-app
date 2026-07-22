"use client";

import { useEffect } from "react";
import { ChevronDown, FileText, History } from "lucide-react";

import DailyLog from "@/components/dashboard/DailyLog";
import InsightsFeed from "@/components/dashboard/InsightsFeed";
import ProgressTracker from "@/components/dashboard/ProgressTracker";
import TodayExperience from "@/components/dashboard/TodayExperience";
import TodaysPlan from "@/components/dashboard/TodaysPlan";
import type { WeeklyExperiment } from "@/lib/activation";

export default function DashboardClient({
  username,
  experiment,
  safetyReviewCount,
}: {
  username: string;
  experiment: WeeklyExperiment | null;
  safetyReviewCount: number;
}) {
  useEffect(() => {
    fetch("/api/provision-user", { method: "POST" }).catch((error) => {
      console.error("Provision user failed:", error);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]">
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <nav className="flex flex-wrap justify-end gap-2" aria-label="Blueprint and report actions">
          <a href="/results" className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#041B2D] shadow-sm hover:bg-[#EAFBF8]">
            <FileText className="mr-2 h-4 w-4" /> View Blueprint
          </a>
          <a href="/dashboard/my-quiz" className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#041B2D] hover:bg-slate-50">
            <History className="mr-2 h-4 w-4" /> Reports and PDF
          </a>
        </nav>

        <TodayExperience
          username={username}
          initialExperiment={experiment}
          safetyReviewCount={safetyReviewCount}
        />

        <section id="daily-log" aria-label="Quick check-in">
          <DailyLog />
        </section>

        <Disclosure title="Your supplement routine" description="Track your current stack, review timing, and manage refills when you need it.">
          <TodaysPlan />
        </Disclosure>

        <Disclosure title="Progress and coaching" description="Explore trends and refresh your coaching insights.">
          <div className="space-y-5">
            <ProgressTracker />
            <InsightsFeed />
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

function Disclosure({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-4 p-5 marker:content-none sm:p-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-[#041B2D]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-[#087F72] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-200 p-4 sm:p-6">{children}</div>
    </details>
  );
}
