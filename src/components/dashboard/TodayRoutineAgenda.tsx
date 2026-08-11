"use client";

import { AlertTriangle, ArrowRight, Check, Clock3, Loader2, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { regimenDoseDaypart, type RegimenDoseDay, type RegimenDoseOccurrence } from "@/lib/regimenDose";
import { localDateString } from "@/lib/regimenSchedule";
import { groupRoutineItems, type RoutineItem } from "@/lib/routine";

export default function TodayRoutineAgenda() {
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [day, setDay] = useState<RegimenDoseDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = localDateString();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [routineResponse, dosesResponse] = await Promise.all([
        fetch("/api/stacks/combined", { cache: "no-store" }),
        fetch(`/api/routine/doses?date=${encodeURIComponent(date)}`, { cache: "no-store" }),
      ]);
      const [routineBody, dosesBody] = await Promise.all([
        routineResponse.json().catch(() => null),
        dosesResponse.json().catch(() => null),
      ]);
      if (!routineResponse.ok || !routineBody?.ok || !dosesResponse.ok || !dosesBody?.ok) {
        throw new Error("routine_unavailable");
      }
      setItems(routineBody.items ?? []);
      setDay(dosesBody.day);
    } catch {
      setError("We could not load today's routine. Your records are unchanged.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const scheduleReviewItems = useMemo(
    () => groupRoutineItems(items).current.filter((item) => !item.schedule),
    [items],
  );
  const occurrences = day?.occurrences ?? [];
  const completed = occurrences.filter((occurrence) => occurrence.status).length;
  const remaining = occurrences.filter((occurrence) => !occurrence.status);
  const next = nextOccurrence(remaining);
  const progress = occurrences.length ? Math.round((completed / occurrences.length) * 100) : 0;
  const dayparts = daypartProgress(occurrences);

  async function recordNext(status: "taken" | "skipped") {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/routine/doses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regimen_item_id: next.regimenItemId,
          date,
          slot_key: next.slotKey,
          status,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error("dose_record_failed");
      await load();
    } catch {
      setError("We could not record that item. Please try again or use Routine.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="flex min-h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white p-5 text-slate-600 shadow-sm" aria-label="Loading today's rhythm">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#087F72]" aria-hidden="true" /> Personalizing today&apos;s rhythm
      </section>
    );
  }

  if (error && !day) {
    return (
      <section className="flex items-start rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm" role="alert">
        <AlertTriangle className="mr-2 mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> {error} Open Routine to try again.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-[#BCE3DA] bg-white shadow-sm" aria-labelledby="daily-rhythm-title">
      <div className="bg-gradient-to-r from-[#F4FAF8] to-[#F8F5FB] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]"><Sparkles className="mr-2 h-4 w-4" aria-hidden="true" /> Personalized nudge</p>
            <h2 id="daily-rhythm-title" className="mt-1 text-2xl font-bold text-[#041B2D]">Your daily rhythm</h2>
          </div>
          <div className="shrink-0 rounded-full bg-white px-3 py-2 text-sm font-bold text-[#06695F] shadow-sm">
            {occurrences.length ? `${completed} of ${occurrences.length}` : "Clear"}
          </div>
        </div>

        {occurrences.length ? <>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Today's routine progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#08A88A] to-[#7C3AED] transition-all" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {dayparts.map((part) => (
              <span key={part.label} className={`rounded-full px-3 py-1.5 text-xs font-bold ${part.complete ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-700"}`}>
                {part.complete ? <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> : null}{part.label} {part.completed}/{part.total}
              </span>
            ))}
          </div>
        </> : null}
      </div>

      <div className="p-5 sm:p-6">
        {error ? <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error}</p> : null}

        {!occurrences.length ? (
          <div className="flex items-start gap-3">
            <Trophy className="mt-0.5 h-6 w-6 shrink-0 text-[#087F72]" aria-hidden="true" />
            <div><p className="font-bold text-[#041B2D]">Your scheduled routine is clear today.</p><p className="mt-1 text-sm leading-6 text-slate-600">Put your attention toward the focused practice above. Small wins still count.</p></div>
          </div>
        ) : next ? (
          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-bold text-[#087F72]">{coachMessage(completed, occurrences.length)}</p>
              <p className="mt-2 flex items-center text-sm font-semibold text-slate-600"><Clock3 className="mr-2 h-4 w-4" aria-hidden="true" /> Next up at {next.timeLabel}</p>
              <h3 className="mt-1 text-xl font-bold text-[#041B2D]">{next.itemName}</h3>
              <p className="mt-1 text-sm text-slate-600">{next.dose || "Dose not recorded"}</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:max-w-56">
              <button type="button" disabled={busy} onClick={() => void recordNext("taken")} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white hover:bg-[#06695F] disabled:opacity-60">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />} Mark taken
              </button>
              <button type="button" disabled={busy} onClick={() => void recordNext("skipped")} className="min-h-11 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-[#041B2D] disabled:opacity-60">Skip</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <Trophy className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" aria-hidden="true" />
            <div><p className="font-bold text-[#041B2D]">Routine complete. Promise kept.</p><p className="mt-1 text-sm leading-6 text-slate-600">You handled today&apos;s scheduled items. Let that win free your attention for the rest of your day.</p></div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          {scheduleReviewItems.length ? (
            <Link href={`/routine#edit-routine-item-${encodeURIComponent(scheduleReviewItems[0].id)}`} className="inline-flex items-center text-sm font-semibold text-amber-800 hover:underline">
              <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" /> {scheduleReviewItems.length} item{scheduleReviewItems.length === 1 ? " needs" : "s need"} a schedule
            </Link>
          ) : <p className="text-xs leading-5 text-slate-500">This tracks the schedule you entered. Follow your existing instructions.</p>}
          <Link href="/routine" className="inline-flex min-h-11 items-center text-sm font-bold text-[#087F72] hover:underline">Open full Routine <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  );
}

function nextOccurrence(remaining: RegimenDoseOccurrence[], now = new Date()): RegimenDoseOccurrence | null {
  if (!remaining.length) return null;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return remaining.find((occurrence) => timeMinutes(occurrence.time) >= currentMinutes) ?? remaining[0];
}

function timeMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function daypartProgress(occurrences: RegimenDoseOccurrence[]) {
  return (["Morning", "Afternoon", "Evening"] as const).flatMap((label) => {
    const items = occurrences.filter((occurrence) => regimenDoseDaypart(occurrence.time) === label);
    if (!items.length) return [];
    const completed = items.filter((occurrence) => occurrence.status).length;
    return [{ label, completed, total: items.length, complete: completed === items.length }];
  });
}

function coachMessage(completed: number, total: number): string {
  if (!completed) return "One clear action is enough to start momentum.";
  if (completed >= Math.ceil(total / 2)) return "You are over halfway there. Keep the rhythm easy.";
  return "Good start. Your next small win is ready.";
}
