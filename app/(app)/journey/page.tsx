import { requireTier } from "@/app/_auth/requireTier";
import JourneyDashboard from "@/components/journey/JourneyDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function JourneyPage() {
  await requireTier(["premium", "trial"]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-4 sm:px-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Journey</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#041B2D] sm:text-4xl">
          Notice what is changing over time.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          See the weeks you tried, the practice sessions you completed, and the patterns worth noticing without turning your life into a score.
        </p>
      </header>

      <JourneyDashboard />
    </div>
  );
}
