"use client";

import { AlertTriangle, ArrowRight, CalendarCheck2, ClipboardList, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getRoutineTodaySummary, type RoutineItem } from "@/lib/routine";

export default function TodaysPlan() {
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stacks/combined", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok) throw new Error("routine_unavailable");
        if (!cancelled) setItems(body.items ?? []);
      })
      .catch(() => { if (!cancelled) setUnavailable(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => getRoutineTodaySummary(items), [items]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="today-routine-summary">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Routine at a glance</p>
          <h2 id="today-routine-summary" className="mt-1 text-xl font-bold text-[#041B2D]">What needs your attention today</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Keep detailed medication, hormone, and supplement organization in Routine. Today only shows what may need attention.
          </p>
        </div>
        <Link href="/routine" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white transition hover:bg-[#06695F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2">
          Open Routine <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
        </Link>
      </div>

      {loading ? (
        <div className="mt-5 flex min-h-24 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#087F72]" aria-hidden="true" /> Loading routine summary
        </div>
      ) : unavailable ? (
        <div className="mt-5 flex items-start rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mr-2 mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> Routine details are temporarily unavailable. Open Routine to try again.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryStat icon={CalendarCheck2} value={summary.dueToday} label="Due today" detail="Based on your recorded schedule" href="/routine" />
          <SummaryStat icon={ClipboardList} value={summary.scheduleReview} label="Need a schedule" detail="Open the item that needs attention" warning={summary.scheduleReview > 0} href="/routine#schedule-review" />
          <SummaryStat icon={AlertTriangle} value={summary.ideasToConsider} label="Ideas to consider" detail="Review before adding anything" warning={summary.ideasToConsider > 0} href="/routine#routine-ideas" />
        </div>
      )}
    </section>
  );
}

function SummaryStat({
  icon: Icon,
  value,
  label,
  detail,
  warning = false,
  href,
}: {
  icon: typeof CalendarCheck2;
  value: number;
  label: string;
  detail: string;
  warning?: boolean;
  href: string;
}) {
  return (
    <Link href={href} className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] ${warning ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <p className="flex items-center text-sm font-bold text-[#041B2D]"><Icon className={`mr-2 h-5 w-5 ${warning ? "text-amber-700" : "text-[#087F72]"}`} aria-hidden="true" /> {label}</p>
      <p className="mt-2 text-3xl font-extrabold text-[#041B2D]">{value}</p>
      <p className="mt-1 flex items-center text-xs leading-5 text-slate-600">{detail}<ArrowRight className="ml-1 h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" /></p>
    </Link>
  );
}
