"use client";

import { useEffect } from "react";
import { ChevronDown } from "lucide-react";

import DailyLog from "@/components/dashboard/DailyLog";
import TodayExperience from "@/components/dashboard/TodayExperience";
import TodaysPlan from "@/components/dashboard/TodaysPlan";
import type { WeeklyExperiment } from "@/lib/activation";

export default function TodayClient({
  experiment,
  safetyReviewCount,
}: {
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
        <TodayExperience
          initialExperiment={experiment}
          safetyReviewCount={safetyReviewCount}
        />

        <section id="daily-log" aria-label="Quick check-in">
          <DailyLog />
        </section>

        <Disclosure title="Your supplement routine" description="Track your current stack, review timing, and manage refills when you need it.">
          <TodaysPlan />
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
