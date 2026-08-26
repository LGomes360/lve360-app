"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { localDateString } from "@/lib/regimenSchedule";

type TodayRow = {
  weight: number | null;
  sleep: number | null;
  energy: number | null;
  notes: string | null;
};

export type DailyCheckInSummary = {
  sleep: number | null;
  energy: number | null;
  weight: number | null;
  hasRequiredState: boolean;
};

type DailyLogProps = {
  date?: string | null;
  onCheckInStateChange?: (summary: DailyCheckInSummary) => void;
  onSaved?: (summary: DailyCheckInSummary) => void;
  onSkip?: () => void;
};

const SLEEP_OPTIONS = [
  { value: 1, label: "Very poor" },
  { value: 2, label: "Poor" },
  { value: 3, label: "Fair" },
  { value: 4, label: "Good" },
  { value: 5, label: "Restorative" },
] as const;

const ENERGY_OPTIONS = [
  { value: 1, label: "Very low" },
  { value: 3, label: "Low" },
  { value: 5, label: "Steady" },
  { value: 8, label: "Good" },
  { value: 10, label: "High" },
] as const;

function closestEnergyBand(value: number) {
  return ENERGY_OPTIONS.reduce((closest, option) => (
    Math.abs(option.value - value) < Math.abs(closest.value - value) ? option : closest
  )).value;
}

function parseWeightInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 2 ? parts.slice(0, 2).join(".") : cleaned;
}

function summaryFor(sleep: number | null, energy: number | null, weight: string): DailyCheckInSummary {
  const numericWeight = weight.trim() === "" ? null : Number(weight);
  return {
    sleep,
    energy,
    weight: Number.isFinite(numericWeight) ? numericWeight : null,
    hasRequiredState: sleep != null && energy != null,
  };
}

export default function DailyLog({
  date,
  onCheckInStateChange,
  onSaved,
  onSkip,
}: DailyLogProps) {
  const [sleep, setSleep] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const localDate = date ?? localDateString();

  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(timer);
  }, [msg]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoaded(false);
      setLoadError(null);
      setPrefilled(false);

      try {
        const response = await fetch(`/api/logs?date=${encodeURIComponent(localDate)}`, {
          cache: "no-store",
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok) throw new Error(body?.error || "load_failed");
        if (cancelled) return;

        if (body.log) {
          const row = body.log as TodayRow;
          const loadedSleep = row.sleep == null ? null : Math.max(1, Math.min(5, row.sleep));
          const loadedEnergy = row.energy == null ? null : Math.max(1, Math.min(10, row.energy));
          const loadedWeight = row.weight == null ? "" : String(row.weight);
          setSleep(loadedSleep);
          setEnergy(loadedEnergy);
          setWeight(loadedWeight);
          setNotes(row.notes ?? "");
          setPrefilled(true);
          onCheckInStateChange?.(summaryFor(loadedSleep, loadedEnergy, loadedWeight));
        } else {
          setSleep(null);
          setEnergy(null);
          setWeight("");
          setNotes("");
          onCheckInStateChange?.(summaryFor(null, null, ""));
        }
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error && error.message !== "load_failed"
          ? error.message
          : "We could not load today's saved check-in. Refresh the page to try again.");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [localDate, onCheckInStateChange]);

  async function submit() {
    const summary = summaryFor(sleep, energy, weight);
    if (!summary.hasRequiredState) {
      setMsg({ kind: "err", text: "Choose sleep quality and energy before continuing." });
      return;
    }

    try {
      setSaving(true);
      setMsg(null);
      const response = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          log_date: localDate,
          sleep: summary.sleep,
          energy: summary.energy,
          weight: summary.weight,
          notes: notes.trim() || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "save_failed");

      setPrefilled(true);
      setMsg({ kind: "ok", text: "Saved. Your next step now reflects today's check-in." });
      onCheckInStateChange?.(summary);
      onSaved?.(summary);
    } catch (error) {
      setMsg({
        kind: "err",
        text: error instanceof Error && error.message !== "save_failed"
          ? error.message
          : "We could not save your check-in. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-[#9DCFC3] bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">How are you starting today?</p>
          <h2 className="mt-2 text-2xl font-bold text-[#041B2D] sm:text-3xl">A quick check-in</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Sleep and energy help LVE360 decide whether today calls for your full practice or its smaller hard-day version.
          </p>
        </div>
        {prefilled ? <span className="w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">Today saved</span> : null}
      </div>

      {!loaded ? (
        <p className="mt-6 flex items-center text-sm font-semibold text-slate-600">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#087F72]" aria-hidden="true" /> Loading today&apos;s check-in
        </p>
      ) : (
        <>
          <fieldset className="mt-6">
            <legend className="text-sm font-bold text-[#041B2D]">How was your sleep?</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {SLEEP_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={sleep === option.value}
                  onClick={() => setSleep(option.value)}
                  className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold transition ${sleep === option.value ? "border-[#087F72] bg-[#EAFBF8] text-[#065F56] ring-2 ring-[#BCE3DA]" : "border-slate-200 bg-white text-slate-700 hover:border-[#9DCFC3] hover:bg-[#F4FAF8]"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="text-sm font-bold text-[#041B2D]">How is your energy?</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ENERGY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={energy != null && closestEnergyBand(energy) === option.value}
                  onClick={() => setEnergy(option.value)}
                  className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold transition ${energy != null && closestEnergyBand(energy) === option.value ? "border-[#087F72] bg-[#EAFBF8] text-[#065F56] ring-2 ring-[#BCE3DA]" : "border-slate-200 bg-white text-slate-700 hover:border-[#9DCFC3] hover:bg-[#F4FAF8]"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-6 max-w-xs rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="text-sm font-semibold text-slate-700">
              Weight in pounds <span className="font-normal text-slate-500">(optional)</span>
              <input
                inputMode="decimal"
                value={weight}
                onChange={(event) => setWeight(parseWeightInput(event.target.value))}
                placeholder="e.g., 220"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
              />
            </label>
          </div>

          <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-bold text-[#041B2D]">Add context to today&apos;s record <span className="font-normal text-slate-500">(optional)</span></summary>
            <div className="mt-4">
              <label className="text-sm font-semibold text-slate-700">
                What stood out today?
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="For example: travel, stress, a late meal, or something that made the practice easier."
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">Saved with today&apos;s record. Structured sleep and energy drive today&apos;s adjustment. A note is never treated as a diagnosis or medical instruction.</span>
              </label>
            </div>
          </details>

          {msg ? (
            <p className={`mt-4 rounded-xl border px-3 py-2 text-sm font-semibold ${msg.kind === "ok" ? "border-teal-200 bg-teal-50 text-teal-800" : "border-amber-200 bg-amber-50 text-amber-900"}`} role={msg.kind === "err" ? "alert" : "status"} aria-live="polite">
              {msg.text}
            </p>
          ) : null}

          {loadError ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900" role="alert">
              {loadError}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || sleep == null || energy == null}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#06695F] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Save check-in and see my next step
              {!saving ? <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /> : null}
            </button>
            <button type="button" onClick={onSkip} className="min-h-11 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-[#041B2D]">
              Continue without a check-in
            </button>
          </div>
        </>
      )}
    </div>
  );
}
