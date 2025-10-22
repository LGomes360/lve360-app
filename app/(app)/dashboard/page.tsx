// app/(app)/dashboard/page.tsx  (SERVER COMPONENT)
import { requireTier } from "@/app/_auth/requireTier";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import GoalsTargetsEditor from "@/src/components/dashboard/GoalsTargetsEditor";
import DashboardClient from "./DashboardClient";

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

  const { data: goals } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const targetWeight = goals?.target_weight ?? null;
  const targetSleep = goals?.target_sleep ?? null;
  const targetEnergy = goals?.target_energy ?? null;

  return (
    <>
      {/* Show the editor only if no targets set yet */}
      {(targetWeight == null && targetSleep == null && targetEnergy == null) ? (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <GoalsTargetsEditor
            targetWeight={targetWeight}
            targetSleep={targetSleep}
            targetEnergy={targetEnergy}
          />
        </div>
      ) : null}

      {/* Your existing dashboard app stays untouched */}
      <DashboardClient />
    </>
  );
}
