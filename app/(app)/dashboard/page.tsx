// app/(app)/dashboard/page.tsx  (SERVER COMPONENT)
import { requireTier } from "@/app/_auth/requireTier";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import GoalsTargetsEditor from "@/src/components/dashboard/GoalsTargetsEditor";
import DashboardClient from "./DashboardClient";
import { getFriendlyFirstName } from "@/src/lib/displayName";
import type { WeeklyExperiment } from "@/lib/activation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  // Keep your existing gating (premium or trial)
  await requireTier(["premium", "trial"]);

  // Server-side: fetch current user + goals (no changes to your client)
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // If requireTier already ensured auth, user should exist — guard anyway:
  if (!user?.id) {
    // You can redirect to /login if you prefer
    return null;
  }

  const [{ data: goals }, { data: experiment }, { data: latestStack }] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("weekly_experiments")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["draft", "active"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("stacks")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let safetyReviewCount = 0;
  if (latestStack?.id) {
    const { data: safetyItems } = await supabase
      .from("stacks_items")
      .select("notes")
      .eq("stack_id", latestStack.id);
    safetyReviewCount = (safetyItems ?? []).filter((item) =>
      /clinician review|interaction|contraindicat|avoid|safety flag|use caution/i.test(item.notes ?? "")
    ).length;
  }

  const targetWeight = goals?.target_weight ?? null;
  const targetSleep = goals?.target_sleep ?? null;
  const targetEnergy = goals?.target_energy ?? null;

  return (
    <>
      <DashboardClient
        username={getFriendlyFirstName(user)}
        experiment={(experiment as WeeklyExperiment | null) ?? null}
        safetyReviewCount={safetyReviewCount}
      />

      {(targetWeight == null && targetSleep == null && targetEnergy == null) ? (
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
