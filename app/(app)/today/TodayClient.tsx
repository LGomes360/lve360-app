"use client";

import { useCallback, useEffect, useState } from "react";
import DailyLog, { type DailyCheckInSummary } from "@/components/dashboard/DailyLog";
import TodayExperience from "@/components/dashboard/TodayExperience";
import TodayRoutineAgenda from "@/components/dashboard/TodayRoutineAgenda";
import type { WeeklyExperiment } from "@/lib/activation";
import type { CurrentBlueprintContext, ExperimentBlueprintContext } from "@/lib/blueprintContext";
import type { PremiumActivationProgress } from "@/lib/premiumActivation";
import PremiumActivationChecklist from "@/components/activation/PremiumActivationChecklist";
import AiTodayBrief from "@/components/dashboard/AiTodayBrief";
import ReminderArrivalFeedback from "@/components/dashboard/ReminderArrivalFeedback";
import type { PracticeConnectionContext } from "@/lib/practiceConnection";
import DailyIntentionCard from "@/components/dashboard/DailyIntentionCard";

export default function TodayClient({
  experiment,
  blueprint,
  experimentBlueprint,
  practiceConnection,
  checkinDate,
  reminderDeliveryId,
  activationProgress,
}: {
  experiment: WeeklyExperiment | null;
  blueprint: CurrentBlueprintContext | null;
  experimentBlueprint: ExperimentBlueprintContext | null;
  practiceConnection: PracticeConnectionContext | null;
  checkinDate: string | null;
  reminderDeliveryId: string | null;
  activationProgress: PremiumActivationProgress;
}) {
  const [firstActionComplete, setFirstActionComplete] = useState(activationProgress.firstActionComplete);
  const [briefVersion, setBriefVersion] = useState(0);
  const [checkInState, setCheckInState] = useState<"loading" | "missing" | "ready" | "skipped">("loading");
  const [checkInSummary, setCheckInSummary] = useState<DailyCheckInSummary | null>(null);
  const visibleProgress = { ...activationProgress, firstActionComplete };
  const decisionReady = checkInState === "ready" || checkInState === "skipped";
  const preferMinimumVersion = checkInState === "ready"
    && Boolean(
      (checkInSummary?.sleep != null && checkInSummary.sleep <= 2)
      || (checkInSummary?.energy != null && checkInSummary.energy <= 3),
    );

  const handleCheckInStateChange = useCallback((summary: DailyCheckInSummary) => {
    setCheckInSummary(summary);
    setCheckInState(summary.hasRequiredState ? "ready" : "missing");
  }, []);

  const handleCheckInSaved = useCallback((summary: DailyCheckInSummary) => {
    setCheckInSummary(summary);
    setCheckInState("ready");
    setBriefVersion((version) => version + 1);
  }, []);

  const handleCheckInSkipped = useCallback(() => {
    setCheckInState("skipped");
    setCheckInSummary(null);
    setBriefVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    setFirstActionComplete(activationProgress.firstActionComplete);
  }, [activationProgress.firstActionComplete]);

  useEffect(() => {
    fetch("/api/provision-user", { method: "POST" }).catch((error) => {
      console.error("Provision user failed:", error);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]">
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PremiumActivationChecklist progress={visibleProgress} surface="today" />

        {experiment?.status === "active" || firstActionComplete ? (
          <>
            <header className="rounded-3xl border border-[#BCE3DA] bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Today</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-[#041B2D] sm:text-4xl">One clear priority for today</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                Start with an optional intention and a quick check-in. LVE360 will keep the next action tied to your saved plan.
              </p>
            </header>

            <DailyIntentionCard date={checkinDate} compact />

            <section id="daily-log" aria-label="Quick check-in">
              <DailyLog
                date={checkinDate}
                onCheckInStateChange={handleCheckInStateChange}
                onSaved={handleCheckInSaved}
                onSkip={handleCheckInSkipped}
              />
            </section>

            <TodayExperience
              initialExperiment={experiment}
              blueprint={blueprint}
              experimentBlueprint={experimentBlueprint}
              practiceConnection={practiceConnection}
              initialCompletionDate={checkinDate}
              decisionReady={decisionReady}
              preferMinimumVersion={preferMinimumVersion}
              onCompletionStateChange={setFirstActionComplete}
              onTodayProgressChange={() => setBriefVersion((version) => version + 1)}
            >
              <AiTodayBrief key={`${checkinDate ?? "today"}-${briefVersion}`} date={checkinDate} />
            </TodayExperience>

            {decisionReady ? <ReminderArrivalFeedback deliveryId={reminderDeliveryId} /> : null}

            {decisionReady ? <TodayRoutineAgenda /> : null}
          </>
        ) : null}

      </div>
    </div>
  );
}
