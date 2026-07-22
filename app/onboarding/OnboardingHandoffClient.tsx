"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

type SelectedAction = { label: string; category: string };

export default function OnboardingHandoffClient() {
  const [selected, setSelected] = useState<SelectedAction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/blueprint-action", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (!cancelled) setSelected(data?.selected ?? null); })
      .catch(() => { if (!cancelled) setSelected(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] px-6 py-20">
      <div className="mx-auto max-w-2xl rounded-3xl border border-[#CDE9E3] bg-white p-8 shadow-xl sm:p-12">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#087F72]">Your first week</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#041B2D]">Start with one action you can repeat</h1>
        <p className="mt-4 text-lg leading-7 text-slate-600">
          Your Blueprint becomes useful when it turns into a small practice. We will use this choice to shape your first weekly plan.
        </p>

        <div className="mt-8 rounded-2xl border border-[#9DCFC3] bg-[#EAFBF8] p-5">
          {loading ? (
            <p className="text-slate-600">Loading your selected action...</p>
          ) : selected ? (
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[#087F72]" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">Selected from your Blueprint</p>
                <p className="mt-2 text-lg font-semibold leading-7 text-[#041B2D]">{selected.label}</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-[#041B2D]">Choose your first small lifestyle action in the dashboard.</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Older Blueprints and reports without a weekly focus use this safe fallback.</p>
            </div>
          )}
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-500">
          Supplement and medication changes stay in your Blueprint for clinician or pharmacist review. They are never turned into habits automatically.
        </p>

        <a
          href="/dashboard"
          className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-[#08A88A] px-5 py-3 font-bold text-white shadow-sm transition hover:bg-[#078B74]"
        >
          Continue to my dashboard <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
        </a>
      </div>
    </main>
  );
}
