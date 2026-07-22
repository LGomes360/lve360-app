"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Pause, RefreshCw, Repeat2, TrendingUp } from "lucide-react";

import type { WeeklyExperiment } from "@/lib/activation";
import { suggestedNextPlan, type NextWeekPlan, type ReviewDecision } from "@/lib/weeklyReview";

type ReviewResponse = {
  ok: boolean;
  experiment?: WeeklyExperiment;
  completed?: number;
  target?: number;
  error?: string;
};

const decisions: Array<{ value: ReviewDecision; title: string; description: string; icon: typeof Check }> = [
  { value: "keep", title: "Keep it", description: "Repeat the same practice next week.", icon: Repeat2 },
  { value: "shrink", title: "Make it smaller", description: "Lower the weekly target so it is easier to repeat.", icon: ArrowLeft },
  { value: "swap", title: "Swap it", description: "Choose a different small lifestyle practice.", icon: RefreshCw },
  { value: "pause", title: "Pause", description: "Close this experiment without starting another.", icon: Pause },
  { value: "advance", title: "Build on it", description: "Add one repetition next week.", icon: TrendingUp },
];

export default function WeeklyReviewClient({ experimentId }: { experimentId: string }) {
  const [experiment, setExperiment] = useState<WeeklyExperiment | null>(null);
  const [completed, setCompleted] = useState(0);
  const [target, setTarget] = useState(1);
  const [difficulty, setDifficulty] = useState(0);
  const [valueRating, setValueRating] = useState(0);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [nextPlan, setNextPlan] = useState<NextWeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/weekly-review?experiment=${encodeURIComponent(experimentId)}`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null) as ReviewResponse | null;
        if (!response.ok || !json?.ok || !json.experiment) throw new Error(reviewError(json?.error));
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setExperiment(json.experiment ?? null);
        setCompleted(json.completed ?? 0);
        setTarget(json.target ?? 1);
      })
      .catch((loadError: Error) => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [experimentId]);

  const ready = useMemo(() => difficulty > 0 && valueRating > 0 && !!decision && (decision === "pause" || !!nextPlan), [difficulty, valueRating, decision, nextPlan]);

  function chooseDecision(value: ReviewDecision) {
    setDecision(value);
    setNextPlan(experiment ? suggestedNextPlan(experiment, value) : null);
  }

  async function finishReview() {
    if (!ready || !decision) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/weekly-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiment_id: experimentId, difficulty, value_rating: valueRating, decision, next_plan: nextPlan }),
      });
      const json = await response.json().catch(() => null) as ReviewResponse | null;
      if (!response.ok || !json?.ok) throw new Error(reviewError(json?.error));
      window.location.assign("/dashboard");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your review was not saved.");
      setSaving(false);
    }
  }

  if (loading) return <ReviewShell><div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#087F72]" /></div></ReviewShell>;
  if (!experiment) return <ReviewShell><p className="rounded-2xl bg-rose-50 p-5 text-rose-800">{error ?? "This review is not available."}</p></ReviewShell>;

  return (
    <ReviewShell>
      <a href="/dashboard" className="inline-flex items-center text-sm font-semibold text-[#087F72] hover:underline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Today</a>
      <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Your weekly review</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#041B2D] sm:text-4xl">Notice what worked. Shape the next week.</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">This is a short experiment review, not a health outcome assessment. Use it to make your practice easier to repeat.</p>

      <section className="mt-8 rounded-3xl bg-[#041B2D] p-6 text-white sm:p-8">
        <p className="text-sm font-semibold text-[#8DE5D5]">This week</p>
        <h2 className="mt-2 text-2xl font-bold">{experiment.action_label}</h2>
        <p className="mt-5 text-4xl font-bold">{completed} <span className="text-lg font-medium text-white/70">of {target} planned reps</span></p>
        <p className="mt-2 text-sm text-white/70">Every completed repetition counts, including the minimum version.</p>
      </section>

      <Rating title="How difficult was this practice to repeat?" low="Very easy" high="Very hard" value={difficulty} onChange={setDifficulty} />
      <Rating title="How useful did this practice feel?" low="Not useful" high="Very useful" value={valueRating} onChange={setValueRating} />

      <section className="mt-10">
        <h2 className="text-2xl font-bold text-[#041B2D]">What should happen next?</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {decisions.map((item) => {
            const Icon = item.icon;
            const selected = decision === item.value;
            return (
              <button key={item.value} type="button" onClick={() => chooseDecision(item.value)} className={`rounded-2xl border p-5 text-left transition ${selected ? "border-[#087F72] bg-[#EAFBF8] ring-2 ring-[#087F72]/20" : "border-slate-200 bg-white hover:border-[#9DCFC3]"}`}>
                <Icon className="h-5 w-5 text-[#087F72]" />
                <span className="mt-3 block font-bold text-[#041B2D]">{item.title}</span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">{item.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      {decision && nextPlan ? <NextPlanEditor plan={nextPlan} onChange={setNextPlan} swap={decision === "swap"} /> : null}
      {decision === "pause" ? <p className="mt-6 rounded-2xl bg-[#F4FAF8] p-5 text-sm leading-6 text-slate-700">Your completed week will stay in your history. You can start a new focused week from Today whenever you are ready.</p> : null}
      {error ? <p className="mt-5 text-sm font-semibold text-rose-700">{error}</p> : null}
      <button onClick={finishReview} disabled={!ready || saving} className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[#08A88A] px-6 py-3 font-bold text-white hover:bg-[#078B74] disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Check className="mr-2 h-5 w-5" />} Finish review <ArrowRight className="ml-2 h-4 w-4" />
      </button>
    </ReviewShell>
  );
}

function Rating({ title, low, high, value, onChange }: { title: string; low: string; high: string; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="mt-9">
      <legend className="text-xl font-bold text-[#041B2D]">{title}</legend>
      <div className="mt-4 flex max-w-md gap-2">
        {[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`${title} ${rating} out of 5`} aria-pressed={value === rating} onClick={() => onChange(rating)} className={`h-12 flex-1 rounded-xl border font-bold ${value === rating ? "border-[#087F72] bg-[#087F72] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#9DCFC3]"}`}>{rating}</button>)}
      </div>
      <div className="mt-2 flex max-w-md justify-between text-xs text-slate-500"><span>{low}</span><span>{high}</span></div>
    </fieldset>
  );
}

function NextPlanEditor({ plan, onChange, swap }: { plan: NextWeekPlan; onChange: (plan: NextWeekPlan) => void; swap: boolean }) {
  return (
    <section className="mt-8 rounded-3xl border border-[#BCE3DA] bg-[#F4FAF8] p-6 sm:p-8">
      <h2 className="text-xl font-bold text-[#041B2D]">{swap ? "Choose next week's practice" : "Your next week"}</h2>
      <label className="mt-5 block text-sm font-bold text-[#041B2D]">Practice<input value={plan.action_label} onChange={(event) => onChange({ ...plan, action_label: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label>
      <label className="mt-4 block text-sm font-bold text-[#041B2D]">After I...<input value={plan.cue} onChange={(event) => onChange({ ...plan, cue: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr]">
        <label className="block text-sm font-bold text-[#041B2D]">Reps per week<input type="number" min={1} max={7} value={plan.frequency_per_week} onChange={(event) => onChange({ ...plan, frequency_per_week: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label>
        <label className="block text-sm font-bold text-[#041B2D]">Minimum version<input value={plan.minimum_version} onChange={(event) => onChange({ ...plan, minimum_version: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label>
      </div>
    </section>
  );
}

function ReviewShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] px-4 py-8 sm:px-6"><div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">{children}</div></main>;
}

function reviewError(error?: string): string {
  if (error === "review_not_due") return "Your weekly review opens on the final day of this focused week.";
  if (error === "review_already_completed") return "This week has already been reviewed.";
  if (error === "invalid_next_plan") return "Check your next practice, cue, target, and minimum version.";
  return "Your weekly review is unavailable right now. Please try again.";
}
