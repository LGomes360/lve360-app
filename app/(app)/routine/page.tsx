import { requireTier } from "@/app/_auth/requireTier";
import { getRoutineData } from "@/lib/routineData";

import RoutineClient from "./RoutineClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RoutinePage() {
  const { user } = await requireTier(["premium", "trial"], { next: "/routine" });
  const data = await getRoutineData(user.id);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="rounded-3xl bg-[#041B2D] px-5 py-7 text-white shadow-sm sm:px-8 sm:py-9">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8DE5D5]">Routine</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Organize what you take and when</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-200">
          Keep your reported prescriptions, hormones, supplements, and timing in one place. Routine records your choices. It does not replace your prescriber, pharmacist, or product label.
        </p>
      </header>

      <RoutineClient initialItems={data.items} latestStack={data.latestStack} />
    </div>
  );
}
