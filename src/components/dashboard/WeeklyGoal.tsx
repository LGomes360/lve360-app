"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Target } from "lucide-react";

import { identityLabel, type WeeklyExperiment } from "@/lib/activation";

export default function WeeklyGoal() {
  const [experiment, setExperiment] = useState<WeeklyExperiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/activation", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.experiment) throw new Error("load failed");
        return json.experiment as WeeklyExperiment;
      })
      .then((loaded) => { if (!cancelled) setExperiment(loaded); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Card><Loader2 className="mr-2 h-5 w-5 animate-spin text-[#087F72]" /> Loading your weekly practice...</Card>;
  if (error) return <Card>We could not load your weekly practice. Refresh the page to try again.</Card>;
  if (!experiment || experiment.status !== "active") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-[#041B2D]"><Target className="h-5 w-5 text-[#087F72]" /> Your Weekly Practice</h2>
        <p className="mt-2 text-slate-600">Turn one Blueprint insight into a small action you can repeat this week.</p>
        <a href="/onboarding" className="mt-5 inline-flex items-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white hover:bg-[#06695F]">{experiment?.status === "draft" ? "Continue setup" : "Build my first week"}<ArrowRight className="ml-2 h-4 w-4" /></a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#9DCFC3] bg-white p-6 shadow-sm" aria-label="Active weekly practice">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Active this week</p>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[#041B2D]"><CheckCircle2 className="h-6 w-6 text-[#08A88A]" /> {experiment.action_label}</h2>
        </div>
        <a href="/onboarding" className="text-sm font-semibold text-[#087F72] hover:underline">Review</a>
      </div>
      <p className="mt-3 text-sm text-slate-600">{identityLabel(experiment.identity_direction)}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Detail label="Cue" value={`After I ${experiment.cue}`} />
        <Detail label="Target" value={`${experiment.frequency_per_week} ${experiment.frequency_per_week === 1 ? "day" : "days"}`} />
        <Detail label="Minimum version" value={experiment.minimum_version ?? "Take the first small step"} />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#F4FAF8] p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">{label}</p><p className="mt-1 text-sm font-semibold leading-6 text-[#041B2D]">{value}</p></div>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center rounded-2xl bg-white p-6 text-slate-700 shadow-sm">{children}</div>;
}
