"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Goal,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { identityLabel, type WeeklyExperiment } from "@/lib/activation";
import { returnedAfterGap, weeklyMomentum, type CompletionKind, type DailyPracticeCompletion } from "@/lib/today";
import { reviewDueDate } from "@/lib/weeklyReview";
import {
  type CurrentBlueprintContext,
  type ExperimentBlueprintContext,
} from "@/lib/blueprintContext";
import { deriveTodayBlueprintNotice, type TodayBlueprintNotice } from "@/lib/todaySurface";
import type { PracticeConnectionContext } from "@/lib/practiceConnection";
import { formatPracticeCue, formatPracticeQuantity, isUsableMinimumVersionText } from "@/lib/practiceQuantity";

type TodayResponse = {
  ok: boolean;
  experiment: WeeklyExperiment | null;
  completions: DailyPracticeCompletion[];
  completed: number;
  bounds?: { start: string; end: string; days: string[] };
  error?: string;
};

export default function TodayExperience({
  initialExperiment,
  blueprint,
  experimentBlueprint,
  practiceConnection,
  initialCompletionDate,
  onCompletionStateChange,
  onTodayProgressChange,
  children,
}: {
  initialExperiment: WeeklyExperiment | null;
  blueprint: CurrentBlueprintContext | null;
  experimentBlueprint: ExperimentBlueprintContext | null;
  practiceConnection: PracticeConnectionContext | null;
  initialCompletionDate: string | null;
  onCompletionStateChange?: (complete: boolean) => void;
  onTodayProgressChange?: () => void;
  children?: ReactNode;
}) {
  const [localDate, setLocalDate] = useState("");
  const [experiment, setExperiment] = useState(initialExperiment);
  const [completions, setCompletions] = useState<DailyPracticeCompletion[]>([]);
  const [weekDays, setWeekDays] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingState, setLoadingState] = useState(!!initialExperiment);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const date = initialCompletionDate ?? toLocalDate(new Date());
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
  }, [initialExperiment, initialCompletionDate]);

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
      onCompletionStateChange?.((json.completions ?? []).length > 0);
      onTodayProgressChange?.();
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
      onCompletionStateChange?.((json.completions ?? []).length > 0);
      onTodayProgressChange?.();
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "We could not undo that completion.");
    } finally {
      setBusy(false);
    }
  }

  if (!experiment || experiment.status !== "active") {
    return (
      <section id="focused-practice" className="rounded-3xl border border-[#9DCFC3] bg-white p-6 shadow-sm sm:p-8" aria-labelledby="today-heading">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Today</p>
        <h1 id="today-heading" className="mt-2 text-3xl font-bold tracking-tight text-[#041B2D] sm:text-4xl">
          Choose one practice for this week.
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
  const recordingPastDate = !!initialCompletionDate && initialCompletionDate !== toLocalDate(new Date());
  const progressPercent = Math.min(100, Math.round((completedCount / target) * 100));
  const momentum = weeklyMomentum(completedCount, target);
  const returnWin = !!localDate && returnedAfterGap(localDate, completions);
  const weekEnded = !!localDate && localDate > reviewDueDate(experiment.week_start);
  const weekNotStarted = !!localDate && localDate < experiment.week_start;
  const blueprintNotice = deriveTodayBlueprintNotice(blueprint, experimentBlueprint);
  const hasUsableMinimum = isUsableMinimumVersionText(experiment.minimum_version);

  return (
    <section id="focused-practice" className="overflow-hidden rounded-3xl border border-[#9DCFC3] bg-white shadow-sm" aria-labelledby="today-heading">
      <div className="bg-[#041B2D] px-6 py-5 text-white sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8DE5D5]">Today</p>
            <h1 id="today-heading" className="mt-1 text-2xl font-bold sm:text-3xl">Your best next step</h1>
          </div>
          <p className="max-w-md text-sm leading-6 text-white/75">One useful action is enough to move this week forward.</p>
        </div>
      </div>

      {blueprintNotice?.tone === "urgent" ? <TodayBlueprintNoticeBanner notice={blueprintNotice} /> : null}

      {blueprintNotice?.tone !== "urgent" ? <div className="p-6 sm:p-8">
        {recordingPastDate ? (
          <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950">
            <strong>Phone-free check-in:</strong> Record whether the practice happened on {formatCheckinDate(localDate)}. You did not need to reopen LVE360 after the habit.
          </div>
        ) : null}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#087F72]">
              <Sparkles className="h-4 w-4" /> Highest-value action today
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-[#041B2D] sm:text-4xl">{experiment.action_label}</h2>
            {practiceConnection ? <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-700 ring-1 ring-slate-200"><span className="text-[#087F72]">Why this matters for you:</span> {practiceConnection.summary}</p> : null}
            <p className="mt-4 text-sm font-semibold text-slate-600">
              <span className="text-[#041B2D]">Saved direction:</span> {identityLabel(experiment.identity_direction)}
            </p>
            <p className="mt-4 text-base leading-7 text-slate-600">
              <strong className="text-[#041B2D]">Your cue:</strong> {formatPracticeCue(experiment.cue)}
            </p>
            {experiment.target_quantity != null && experiment.quantity_unit ? <p className="mt-2 text-base leading-7 text-slate-600"><strong className="text-[#041B2D]">Target each time:</strong> {formatPracticeQuantity(experiment.target_quantity, experiment.quantity_unit)}</p> : null}
          </div>
          <a href="/onboarding" className="shrink-0 text-sm font-semibold text-[#087F72] hover:underline">Review practice</a>
        </div>

        {children ? <div className="mt-6">{children}</div> : null}

        <div className="mt-7 rounded-2xl border border-[#BCE3DA] bg-[#F4FAF8] p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">Minimum version if today gets hard</p>
          <p className="mt-2 text-lg font-semibold text-[#041B2D]">{hasUsableMinimum ? experiment.minimum_version : "Choose a concrete hard-day version before recording it."}</p>
          {hasUsableMinimum && experiment.minimum_quantity != null && experiment.minimum_quantity_unit ? <p className="mt-1 text-sm text-slate-600">Structured minimum: {formatPracticeQuantity(experiment.minimum_quantity, experiment.minimum_quantity_unit)}</p> : null}
          {!hasUsableMinimum ? <a href="/onboarding" className="mt-3 inline-flex text-sm font-bold text-[#087F72] hover:underline">Review hard-day version <ArrowRight className="ml-1 h-4 w-4" /></a> : null}
        </div>

        <div className="mt-7" aria-live="polite">
          {weekEnded ? (
            <div className="rounded-2xl bg-[#EAFBF8] p-5">
              <p className="font-bold text-[#041B2D]">Review this week before recording another completion.</p>
              <a href={`/review?experiment=${encodeURIComponent(experiment.id)}`} className="mt-3 inline-flex items-center text-sm font-bold text-[#087F72] hover:underline">Open weekly review <ArrowRight className="ml-2 h-4 w-4" /></a>
            </div>
          ) : weekNotStarted ? (
            <div className="rounded-2xl bg-[#EAFBF8] p-5">
              <p className="font-bold text-[#041B2D]">Your next focused week is ready.</p>
              <p className="mt-1 text-sm text-slate-600">Come back when the new week begins to record your first completion.</p>
            </div>
          ) : todayCompletion ? (
            <div className="flex flex-col gap-4 rounded-2xl bg-[#EAFBF8] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[#087F72]" />
                <div>
                  <p className="font-bold text-[#041B2D]">
                    {todayCompletion.completion_kind === "minimum" ? "Minimum version complete." : recordingPastDate ? "That practice is recorded." : returnWin ? "You came back today." : "Full version complete."}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {todayCompletion.completion_kind === "minimum"
                      ? "You protected the routine on a hard day. That completion counts fully toward this week's plan."
                      : returnWin
                        ? "Returning after a gap is a consistency win. Your progress continues from here."
                        : completedCount >= target
                          ? "This completion kept your weekly promise. Extra sessions are optional."
                          : `Completion ${completedCount} of ${target} is recorded for this week.`}
                  </p>
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
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Check className="mr-2 h-5 w-5" />} {recordingPastDate ? "I did it that day" : "I did it today"}
              </button>
              {hasUsableMinimum ? <button onClick={() => saveCompletion("minimum")} disabled={busy || !localDate} className="min-h-12 rounded-xl border border-[#9DCFC3] px-5 py-3 text-sm font-bold text-[#087F72] hover:bg-[#F4FAF8] disabled:opacity-60">
                I did the minimum version
              </button> : null}
            </div>
          )}
          {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </div>

        {blueprintNotice?.tone === "maintenance" ? <TodayBlueprintNoticeBanner notice={blueprintNotice} /> : null}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6" aria-live="polite">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]"><Goal className="h-4 w-4" /> Weekly promise</p>
              <p className="mt-2 text-2xl font-bold text-[#041B2D]">{completedCount} of {target}</p>
              <p className="mt-1 text-sm text-slate-600">planned practice completions</p>
            </div>
            <div className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${momentum.stage === "kept" ? "bg-emerald-100 text-emerald-800" : momentum.stage === "building" ? "bg-teal-100 text-teal-800" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>
              {momentum.label}
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Weekly practice momentum" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(completedCount, target)}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#08A88A] to-[#58CDB8] transition-[width] duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-700">{momentum.message}</p>
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

        {blueprint ? <BlueprintConnectionDetails blueprint={blueprint} experimentBlueprint={experimentBlueprint} /> : null}
      </div> : null}
    </section>
  );
}

function TodayBlueprintNoticeBanner({ notice }: { notice: TodayBlueprintNotice }) {
  const urgent = notice.tone === "urgent";
  return (
    <aside className={`${urgent ? "border-rose-200 bg-rose-50 text-rose-950" : "border-amber-200 bg-amber-50 text-amber-950"} ${urgent ? "border-b px-6 py-4 sm:px-8" : "mt-7 rounded-2xl border p-4 sm:p-5"}`} aria-label={urgent ? "Urgent Blueprint safety notice" : "Blueprint maintenance notice"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${urgent ? "text-rose-700" : "text-amber-700"}`} aria-hidden="true" />
          <div>
            <p className="font-bold">{notice.title}</p>
            <p className="mt-1 text-sm leading-6 opacity-80">{notice.detail}</p>
          </div>
        </div>
        <a href={notice.href} className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:bg-white/70 ${urgent ? "border-rose-300 text-rose-800" : "border-amber-300 text-amber-900"}`}>
          {notice.actionLabel} <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
}

function BlueprintConnectionDetails({
  blueprint,
  experimentBlueprint,
}: {
  blueprint: CurrentBlueprintContext;
  experimentBlueprint: ExperimentBlueprintContext | null;
}) {
  if (!experimentBlueprint?.priority_label && !blueprint.priorities.length) return null;
  return (
    <details className="mt-5 rounded-2xl border border-slate-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-[#06695F] marker:content-none">
        <span>Blueprint connection</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </summary>
      <div className="border-t border-slate-100 px-4 py-4 text-sm text-slate-700">
      {experimentBlueprint?.priority_label ? (
        <p className="rounded-xl bg-[#F4FAF8] p-3 leading-6">
          <strong className="text-[#041B2D]">This focused week came from:</strong> {experimentBlueprint.priority_label}
        </p>
      ) : null}
      {experimentBlueprint?.needs_review ? <p className="mt-3 text-amber-900">Your active practice has not been overwritten.</p> : null}
      {blueprint.priorities.length ? <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Current priorities</p>
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          {blueprint.priorities.slice(0, 3).map((priority) => (
            <li key={priority.id} className="flex items-start gap-2">
              {priority.kind === "review_only" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-label="Review only" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#087F72]" aria-hidden="true" />}
              {priority.kind === "review_only" ? (
                <a href={`/blueprints/${blueprint.stack_id}#${(blueprint.actionable_recommendation_count ?? 0) > 0 ? "recommendation-decisions" : "recommendation-report"}`} className="font-semibold text-amber-900 underline decoration-amber-300 underline-offset-2 hover:decoration-amber-700">
                  {priority.label} {(blueprint.actionable_recommendation_count ?? 0) > 0
                    ? "Review why this appeared and choose what to do."
                    : "Review this recommendation in your report."}
                </a>
              ) : <span>{priority.label}</span>}
            </li>
          ))}
        </ul>
      </div> : null}
      <a href={`/blueprints/${blueprint.stack_id}`} className="mt-4 inline-flex min-h-11 items-center font-bold text-[#087F72] hover:underline">
        Open current Blueprint <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
      </a>
      </div>
    </details>
  );
}

function toLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCheckinDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function weekdayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${date}T12:00:00.000Z`));
}
