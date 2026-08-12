// Canonical paid home: one focused action for today.
import { requireTier } from "@/app/_auth/requireTier";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import GoalsTargetsEditor from "@/src/components/dashboard/GoalsTargetsEditor";
import TodayClient from "./TodayClient";
import type { WeeklyExperiment } from "@/lib/activation";
import { getCurrentBlueprintContext, getExperimentBlueprintContexts } from "@/lib/currentBlueprintContext";
import { parseLocalDate } from "@/lib/today";
import { getPremiumActivationProgress } from "@/lib/premiumActivation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({ searchParams }: { searchParams: Promise<{ checkin?: string; reminder_delivery?: string }> }) {
  // Keep your existing gating (premium or trial)
  await requireTier(["premium", "trial"]);
  const params = await searchParams;
  const checkinDate = parseLocalDate(params.checkin ?? null);
  const reminderDeliveryId = typeof params.reminder_delivery === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.reminder_delivery)
    ? params.reminder_delivery
    : null;

  // Server-side: fetch current user + goals (no changes to your client)
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // If requireTier already ensured auth, user should exist. Guard anyway.
  if (!user?.id) {
    // You can redirect to /login if you prefer
    return null;
  }

  let unratedReminderDeliveryId: string | null = null;
  if (reminderDeliveryId) {
    const { data: existingFeedback, error: feedbackLookupError } = await supabase
      .from("reminder_feedback")
      .select("id")
      .eq("user_id", user.id)
      .eq("delivery_id", reminderDeliveryId)
      .maybeSingle();
    // Fail closed if feedback state cannot be verified. A transient read error
    // should not make a member answer the same timing question repeatedly.
    if (!feedbackLookupError && !existingFeedback) unratedReminderDeliveryId = reminderDeliveryId;
  }

  const blueprintPromise = getCurrentBlueprintContext(user.id);
  const [{ data: goals }, { data: experiment }, blueprint, activationProgress] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("weekly_experiments")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["draft", "active"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    blueprintPromise,
    getPremiumActivationProgress(user),
  ]);
  const activeExperiment = (experiment as WeeklyExperiment | null) ?? null;
  const experimentBlueprints = activeExperiment
    ? await getExperimentBlueprintContexts(user.id, [activeExperiment], blueprint)
    : {};

  const targetWeight = goals?.target_weight ?? null;
  const targetSleep = goals?.target_sleep ?? null;
  const targetEnergy = goals?.target_energy ?? null;

  return (
    <>
      <TodayClient
        experiment={activeExperiment}
        blueprint={blueprint}
        experimentBlueprint={activeExperiment ? experimentBlueprints[activeExperiment.id] ?? null : null}
        checkinDate={checkinDate}
        reminderDeliveryId={unratedReminderDeliveryId}
        activationProgress={activationProgress}
      />

      {(activationProgress.practice.status === "active" || activationProgress.firstActionComplete)
        && (targetWeight == null && targetSleep == null && targetEnergy == null) ? (
        <div className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
          <GoalsTargetsEditor
            targetWeight={targetWeight}
            targetSleep={targetSleep}
            targetEnergy={targetEnergy}
          />
        </div>
      ) : null}

    </>
  );
}
