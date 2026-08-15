"use client";

import { useEffect, useState } from "react";
import DailyLog from "@/components/dashboard/DailyLog";
import TodayExperience from "@/components/dashboard/TodayExperience";
import TodayRoutineAgenda from "@/components/dashboard/TodayRoutineAgenda";
import type { WeeklyExperiment } from "@/lib/activation";
import type { CurrentBlueprintContext, ExperimentBlueprintContext } from "@/lib/blueprintContext";
import type { PremiumActivationProgress } from "@/lib/premiumActivation";
import PremiumActivationChecklist from "@/components/activation/PremiumActivationChecklist";
import AiTodayBrief from "@/components/dashboard/AiTodayBrief";
import ReminderArrivalFeedback from "@/components/dashboard/ReminderArrivalFeedback";

export default function TodayClient({
  experiment,
  blueprint,
  experimentBlueprint,
  checkinDate,
  reminderDeliveryId,
  activationProgress,
}: {
  experiment: WeeklyExperiment | null;
  blueprint: CurrentBlueprintContext | null;
  experimentBlueprint: ExperimentBlueprintContext | null;
  checkinDate: string | null;
  reminderDeliveryId: string | null;
  activationProgress: PremiumActivationProgress;
}) {
  const [firstActionComplete, setFirstActionComplete] = useState(activationProgress.firstActionComplete);
  const [practiceRefreshKey, setPracticeRefreshKey] = useState(0);
  const visibleProgress = { ...activationProgress, firstActionComplete };

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
            <ReminderArrivalFeedback deliveryId={reminderDeliveryId} />

            <TodayExperience
              key={`${experiment?.id ?? "none"}:${practiceRefreshKey}`}
              initialExperiment={experiment}
              blueprint={blueprint}
              experimentBlueprint={experimentBlueprint}
              initialCompletionDate={checkinDate}
              onCompletionStateChange={setFirstActionComplete}
            />

            <AiTodayBrief
              date={checkinDate}
              onPracticeCompleted={() => {
                setFirstActionComplete(true);
                setPracticeRefreshKey((value) => value + 1);
              }}
            />

            <TodayRoutineAgenda />

            <section id="daily-log" aria-label="Quick check-in">
              <DailyLog />
            </section>
          </>
        ) : null}

      </div>
    </div>
  );
}
