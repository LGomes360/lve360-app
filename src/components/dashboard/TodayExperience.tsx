"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { identityLabel, type WeeklyExperiment } from "@/lib/activation";
import type { CompletionKind, DailyPracticeCompletion } from "@/lib/today";

type TodayResponse = {
  ok: boolean;
  experiment: WeeklyExperiment | null;
  completions: DailyPracticeCompletion[];
  completed: number;
  bounds?: { start: string; end: string; days: string[] };
  error?: string;
};

export default function TodayExperience({
  username,
  initialExperiment,
  safetyReviewCount,
}: {
  username: string;
  initialExperiment: WeeklyExperiment | null;
  safetyReviewCount: number;
}) {
  const [localDate, setLocalDate] = useState("");
  const [experiment, setExperiment] = useState(initialExperiment);
  const [completions, setCompletions] = useState<DailyPracticeCompletion[]>([]);
  const [weekDays, setWeekDays] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingState, setLoadingState] = useState(!!initialExperiment);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const date = toLocalDate(new Date());
    setLocalDate(date);
    if (!initialExperiment) {
      setLoadingState(false);
      return;
    }

    let cancelled = false;
    fetch(`/api/today?date=${date}`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null) as TodayResponse | null;
        if (!response.ok || !json?.ok) throw new Error("We could not load today's progress.");
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setExperiment(json.experiment);
        setCompletions(json.completions ?? []);
        setWeekDays(json.bounds?.days ?? []);
      })
      .catch((loadError: Error) => {
        if (!cancelled) setError(loadError.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingState(false);
      });
    return () => { cancelled = true; };
  }, [initialExperiment]);

  const todayCompletion = useMemo(
    () => completions.find((item) => item.completion_date === localDate) ?? null,
    [completions, localDate]
  );
  const completedCount = useMemo(
    () => new Set(completions.map((item) => item.completion_date)).size,
    [completions]
  );

  async function saveCompletion(kind: CompletionKind) {
    if (!localDate) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/today", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: localDate, kind }),
      });
      const json = await response.json().catch(() => null) as TodayResponse | null;
      if (!response.ok || !json?.ok) throw new Error("Your progress was not saved. Please try again.");
      setCompletions(json.completions ?? []);
      setWeekDays(json.bounds?.days ?? []);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your progress was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function undoCompletion() {
    if (!localDate) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/today?date=${localDate}`, { method: "DELETE" });
      const json = await response.json().catch(() => null) as TodayResponse | null;
      if (!response.ok || !json?.ok) throw new Error("We could not undo that completion.");
      setCompletions(json.completions ?? []);
      setWeekDays(json.bounds?.days ?? []);
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "We could not undo that completion.");
    } finally {
      setBusy(false);
    }
  }

  if (!experiment || experiment.status !== "active") {
    return (
      <section className="rounded-3xl border border-[#9DCFC3] bg-white p-6 shadow-sm sm:p-8" aria-labelledby="today-heading">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Today</p>
        <h1 id="today-heading" className="mt-2 text-3xl font-bold tracking-tight text-[#041B2D] sm:text-4xl">
          Good to see you, {username}.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Set up one focused practice so LVE360 can help you turn your Blueprint into a week you can actually follow.
        </p>
        <a href="/onboarding" className="mt-6 inline-flex items-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white hover:bg-[#06695F]">
          Build my focused week <ArrowRight className="ml-2 h-4 w-4" />
        </a>
      </section>
    );
  }

  const target = experiment.frequency_per_week ?? 1;
  const targetMet = completedCount >= target;

  return (
    <section className="overflow-hidden rounded-3xl border border-[#9DCFC3] bg-white shadow-sm" aria-labelledby="today-heading">
      <div className="bg-[#041B2D] px-6 py-5 text-white sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8DE5D5]">Today</p>
            <h1 id="today-heading" className="mt-1 text-2xl font-bold sm:text-3xl">Good to see you, {username}.</h1>
          </div>
          <p className="max-w-md text-sm leading-6 text-white/75">One useful action is enough to move this week forward.</p>
        </div>
      </div>

      {safetyReviewCount > 0 ? (
        <a href="/results" className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-6 py-4 text-amber-950 hover:bg-amber-100 sm:px-8">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <span className="text-sm leading-6">
            <strong>{safetyReviewCount} {safetyReviewCount === 1 ? "item needs" : "items need"} safety review.</strong>{" "}
            Keep those Blueprint notes in view before changing your stack.
          </span>
          <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0" />
        </a>
      ) : null}

      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#087F72]">
              <Sparkles className="h-4 w-4" /> {identityLabel(experiment.identity_direction)}
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-[#041B2D] sm:text-4xl">{experiment.action_label}</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              <strong className="text-[#041B2D]">Your cue:</strong> After I {experiment.cue}
            </p>
          </div>
          <a href="/onboarding" className="shrink-0 text-sm font-semibold text-[#087F72] hover:underline">Review practice</a>
        </div>

        <div className="mt-7 rounded-2xl border border-[#BCE3DA] bg-[#F4FAF8] p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">The version that counts on a hard day</p>
          <p className="mt-2 text-lg font-semibold text-[#041B2D]">{experiment.minimum_version}</p>
        </div>

        <div className="mt-7" aria-live="polite">
          {todayCompletion ? (
            <div className="flex flex-col gap-4 rounded-2xl bg-[#EAFBF8] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[#087F72]" />
                <div>
                  <p className="font-bold text-[#041B2D]">
                    {todayCompletion.completion_kind === "minimum" ? "Your minimum version counts." : "Today's practice is complete."}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">You kept the promise small and moved your identity forward.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {todayCompletion.completion_kind === "minimum" ? (
                  <button onClick={() => saveCompletion("full")} disabled={busy} className="rounded-lg bg-[#087F72] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                    Mark full version
                  </button>
                ) : null}
                <button onClick={undoCompletion} disabled={busy} className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white disabled:opacity-60">
                  <RotateCcw className="mr-2 h-4 w-4" /> Undo
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button onClick={() => saveCompletion("full")} disabled={busy || !localDate} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#08A88A] px-6 py-3 text-base font-bold text-white shadow-sm hover:bg-[#078B74] disabled:opacity-60">
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Check className="mr-2 h-5 w-5" />} I did it today
              </button>
              <button onClick={() => saveCompletion("minimum")} disabled={busy || !localDate} className="min-h-12 rounded-xl border border-[#9DCFC3] px-5 py-3 text-sm font-bold text-[#087F72] hover:bg-[#F4FAF8] disabled:opacity-60">
                I did the minimum version
              </button>
            </div>
          )}
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">This week</p>
              <p className="mt-1 text-lg font-bold text-[#041B2D]">{completedCount} of {target} planned reps</p>
            </div>
            <p className="text-sm text-slate-600">{targetMet ? "Weekly target met. Extra reps are optional." : "Small repetitions compound."}</p>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-2" aria-label={`${completedCount} weekly completions`}>
            {weekDays.map((day) => {
              const completion = completions.find((item) => item.completion_date === day);
              const isToday = day === localDate;
              return (
                <div key={day} className="text-center">
                  <p className="mb-2 text-xs font-semibold text-slate-500">{weekdayLabel(day)}</p>
                  <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border ${completion ? "border-[#08A88A] bg-[#08A88A] text-white" : isToday ? "border-[#087F72] bg-white text-[#087F72]" : "border-slate-200 bg-slate-50 text-slate-300"}`} title={completion ? `${completion.completion_kind} version completed` : "Not completed"}>
                    {completion ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                  </div>
                </div>
              );
            })}
          </div>
          {loadingState ? <p className="mt-3 text-xs text-slate-500">Loading this week's progress...</p> : null}
        </div>
      </div>
    </section>
  );
}

function toLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${date}T12:00:00.000Z`));
}
