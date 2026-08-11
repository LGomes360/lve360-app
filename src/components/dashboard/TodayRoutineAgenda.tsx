"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import TodayDoses from "@/app/(app)/routine/TodayDoses";
import { groupRoutineItems, type RoutineItem } from "@/lib/routine";

export default function TodayRoutineAgenda() {
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
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const scheduleReviewItems = useMemo(
    () => groupRoutineItems(items).current.filter((item) => !item.schedule),
    [items],
  );

  if (loading) {
    return (
      <section className="flex min-h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white p-5 text-slate-600 shadow-sm" aria-label="Loading today's routine">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#087F72]" aria-hidden="true" /> Loading today&apos;s routine
      </section>
    );
  }

  if (unavailable) {
    return (
      <section className="flex items-start rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm" role="alert">
        <AlertTriangle className="mr-2 mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> We could not load today&apos;s routine. Your records are unchanged. Open Routine to try again.
      </section>
    );
  }

  return (
    <TodayDoses
      refreshToken={0}
      scheduleReviewItems={scheduleReviewItems}
      variant="today"
    />
  );
}
