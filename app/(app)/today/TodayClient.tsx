"use client";

import { useEffect } from "react";
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

        <TodaysPlan />

      </div>
    </div>
  );
}
