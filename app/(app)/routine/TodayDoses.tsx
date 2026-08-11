"use client";

import { AlertTriangle, Check, Clock3, History, Loader2, Pencil, RotateCcw, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { regimenDoseDaypart, type AsNeededRegimenItem, type RegimenDoseDay, type RegimenDoseOccurrence, type RegimenDoseStatus } from "@/lib/regimenDose";
import { localDateString } from "@/lib/regimenSchedule";
import type { RoutineItem } from "@/lib/routine";
import { doseIntegrityIssue } from "@/lib/doseIntegrity";

export default function TodayDoses({
  refreshToken,
  scheduleReviewItems,
  onEditSchedule,
}: {
  refreshToken: number;
  scheduleReviewItems: RoutineItem[];
  onEditSchedule: (item: RoutineItem) => void;
}) {
  const [day, setDay] = useState<RegimenDoseDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const date = localDateString();
  const dayparts = useMemo(() => groupByDaypart(day?.occurrences ?? []), [day]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/routine/doses?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "routine_doses_unavailable");
      setDay(body.day);
    } catch {
      setError("We could not load today's dose list. Your routine records are unchanged.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function record(occurrence: RegimenDoseOccurrence, status: RegimenDoseStatus) {
    const key = `${occurrence.regimenItemId}:${occurrence.slotKey}`;
    setBusyKey(key);
    setError(null);
    try {
      const response = await fetch("/api/routine/doses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regimen_item_id: occurrence.regimenItemId,
          date,
          slot_key: occurrence.slotKey,
          status,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "dose_record_failed");
      await load();
    } catch {
      setError("We could not save that dose record. Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  async function recordAsNeeded(item: AsNeededRegimenItem) {
    setBusyKey(`as-needed:${item.regimenItemId}`);
    setError(null);
    try {
      const response = await fetch("/api/routine/doses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regimen_item_id: item.regimenItemId, date, slot_key: "as_needed", status: "taken" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "dose_record_failed");
      await load();
    } catch {
      setError("We could not save that as-needed record. Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  async function recordGroup(label: string, occurrences: RegimenDoseOccurrence[]) {
    const remaining = occurrences.filter((occurrence) => !occurrence.status);
    if (!remaining.length) return;
    setBusyKey(`group:${label}`);
    setError(null);
    try {
      const responses = await Promise.all(remaining.map((occurrence) => fetch("/api/routine/doses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regimen_item_id: occurrence.regimenItemId,
          date,
          slot_key: occurrence.slotKey,
          status: "taken",
        }),
      })));
      if (responses.some((response) => !response.ok)) throw new Error("dose_group_record_failed");
      await load();
    } catch {
      await load();
      setError("Some items may not have been recorded. Review this section and try any remaining items again.");
    } finally {
      setBusyKey(null);
    }
  }

  async function undo(eventId: string) {
    setBusyKey(eventId);
    setError(null);
    try {
      const response = await fetch("/api/routine/doses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "dose_undo_failed");
      await load();
    } catch {
      setError("We could not undo that record. Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[#9DCFC3] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="today-doses-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Today</p>
          <h2 id="today-doses-heading" className="mt-1 text-2xl font-bold text-[#041B2D]">Your dose checklist</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Mark each scheduled occurrence separately. This records what happened and does not change your instructions.
          </p>
        </div>
        <p className="rounded-full bg-[#EAFBF8] px-3 py-2 text-sm font-bold text-[#06695F]">{formatDay(date)}</p>
      </div>

      {error ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error}</p> : null}
      {loading ? <p className="mt-5 flex items-center text-sm font-semibold text-slate-600"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading your dose list...</p> : null}

      {!loading && day ? (
        <>
          <div className="mt-5 space-y-5">
            {dayparts.map(({ label, occurrences }) => {
              const remaining = occurrences.filter((occurrence) => !occurrence.status);
              const groupBusy = busyKey === `group:${label}`;
              return (
                <section key={label} className="overflow-hidden rounded-2xl border border-slate-200" aria-labelledby={`dose-${label.toLowerCase()}`}>
                  <div className="flex flex-col gap-3 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 id={`dose-${label.toLowerCase()}`} className="text-lg font-bold text-[#041B2D]">{label}</h3>
                      <p className="mt-1 text-xs text-slate-600">{occurrences.length} scheduled item{occurrences.length === 1 ? "" : "s"}</p>
                    </div>
                    {remaining.length ? (
                      <button type="button" disabled={busyKey !== null} onClick={() => void recordGroup(label, occurrences)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#087F72] bg-white px-4 py-2 text-sm font-bold text-[#06695F] hover:bg-[#EAFBF8] disabled:opacity-60">
                        {groupBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                        Mark {remaining.length === occurrences.length ? "all" : `${remaining.length} remaining`} taken
                      </button>
                    ) : <span className="inline-flex min-h-11 items-center text-sm font-bold text-emerald-800"><Check className="mr-2 h-4 w-4" aria-hidden="true" /> All recorded</span>}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {occurrences.map((occurrence) => {
                      const key = `${occurrence.regimenItemId}:${occurrence.slotKey}`;
                      const busy = busyKey === key || (Boolean(occurrence.eventId) && busyKey === occurrence.eventId);
                      const doseIssue = doseIntegrityIssue(occurrence.itemName, occurrence.dose);
                      return (
                        <article key={key} className="p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
                  <div>
                    <p className="flex items-center text-sm font-bold text-[#087F72]"><Clock3 className="mr-2 h-4 w-4" aria-hidden="true" /> {occurrence.timeLabel}</p>
                    <h3 className="mt-1 text-lg font-bold text-[#041B2D]">{occurrence.itemName}</h3>
                    <p className="mt-1 text-sm text-slate-600">{occurrence.dose || "Dose not recorded"}</p>
                    {doseIssue ? <p className="mt-1 flex items-start text-xs font-semibold text-amber-800"><AlertTriangle className="mr-1.5 mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Confirm amount and unit in Routine.</p> : null}
                  </div>
                  {occurrence.status ? (
                    <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:items-end">
                      <span className={`inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-bold ${occurrence.status === "taken" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}`}>
                        {occurrence.status === "taken" ? <Check className="mr-2 h-4 w-4" aria-hidden="true" /> : <SkipForward className="mr-2 h-4 w-4" aria-hidden="true" />}
                        {occurrence.status === "taken" ? "Taken" : "Skipped"}
                      </span>
                      <button type="button" disabled={busy || !occurrence.eventId} onClick={() => occurrence.eventId && void undo(occurrence.eventId)} className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 py-2 text-sm font-bold text-[#087F72] hover:bg-[#EAFBF8] disabled:opacity-60">
                        <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Undo
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-0 sm:w-64">
                      <button type="button" disabled={busy} onClick={() => void record(occurrence, "taken")} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-4 py-3 font-bold text-white hover:bg-[#06695F] disabled:opacity-60">
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />} Taken
                      </button>
                      <button type="button" disabled={busy} onClick={() => void record(occurrence, "skipped")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                        <SkipForward className="mr-2 h-4 w-4" aria-hidden="true" /> Skip
                      </button>
                    </div>
                  )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {!day.occurrences.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No scheduled doses are due today.</p> : null}
          </div>

          {day.asNeeded.length ? (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="font-bold text-[#041B2D]">As needed</h3>
              <p className="mt-1 text-sm text-slate-600">These items never appear overdue. Record one only when you take it under your existing instructions.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {day.asNeeded.map((item) => {
                  const busy = busyKey === `as-needed:${item.regimenItemId}`;
                  const doseIssue = doseIntegrityIssue(item.itemName, item.dose);
                  return <div key={item.regimenItemId} className="rounded-xl border border-slate-200 p-4"><h4 className="font-bold text-[#041B2D]">{item.itemName}</h4><p className="mt-1 text-sm text-slate-600">{item.dose || "Dose not recorded"}</p>{doseIssue ? <p className="mt-1 text-xs font-semibold text-amber-800">Confirm amount and unit in Routine.</p> : null}<button type="button" disabled={busy} onClick={() => void recordAsNeeded(item)} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[#087F72] px-4 py-3 font-bold text-[#06695F] hover:bg-[#EAFBF8] disabled:opacity-60">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />} Record taken</button></div>;
                })}
              </div>
            </div>
          ) : null}

          {scheduleReviewItems.length ? (
            <section id="schedule-review" className="mt-5 scroll-mt-24 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950" aria-labelledby="schedule-review-heading">
              <h3 id="schedule-review-heading" className="font-bold">Complete {scheduleReviewItems.length} schedule{scheduleReviewItems.length === 1 ? "" : "s"}</h3>
              <p className="mt-1 text-sm leading-6">These items need a structured time or cadence before they can appear in the checklist.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {scheduleReviewItems.map((item) => (
                  <button key={item.id} type="button" onClick={() => onEditSchedule(item)} className="inline-flex min-h-11 items-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100">
                    <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit {item.name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <details className="mt-6 border-t border-slate-200 pt-5">
            <summary className="flex min-h-12 cursor-pointer items-center font-bold text-[#041B2D]"><History className="mr-2 h-5 w-5" aria-hidden="true" /> Recent dose history</summary>
            <div className="mt-3 space-y-2">
              {day.history.map((entry) => <div key={entry.eventId} className="flex flex-col gap-1 rounded-xl bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="font-semibold text-[#041B2D]">{entry.itemName}{entry.dose ? `, ${entry.dose}` : ""}</span><span className="text-slate-600">{formatDay(entry.date)}{entry.time ? ` at ${entry.time}` : ""} · {entry.status === "taken" ? "Taken" : "Skipped"}</span></div>)}
              {!day.history.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No dose records yet.</p> : null}
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}

function groupByDaypart(occurrences: RegimenDoseOccurrence[]): Array<{ label: "Morning" | "Afternoon" | "Evening"; occurrences: RegimenDoseOccurrence[] }> {
  const groups = {
    Morning: [] as RegimenDoseOccurrence[],
    Afternoon: [] as RegimenDoseOccurrence[],
    Evening: [] as RegimenDoseOccurrence[],
  };
  for (const occurrence of occurrences) {
    const label = regimenDoseDaypart(occurrence.time);
    groups[label].push(occurrence);
  }
  return (["Morning", "Afternoon", "Evening"] as const)
    .map((label) => ({ label, occurrences: groups[label] }))
    .filter((group) => group.occurrences.length > 0);
}

function formatDay(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}
