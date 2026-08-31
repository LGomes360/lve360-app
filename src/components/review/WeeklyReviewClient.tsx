"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lightbulb, Loader2, Pause, RefreshCw, Repeat2, Sparkles, TrendingUp, X } from "lucide-react";

import type { WeeklyExperiment } from "@/lib/activation";
import { suggestedNextPlan, validateNextPlan, type NextWeekPlan, type ReviewDecision } from "@/lib/weeklyReview";
import type { WeeklySynthesis } from "@/lib/weeklySynthesis";
import type { PracticeConnectionContext } from "@/lib/practiceConnection";
import type { CoachActionProposal } from "@/lib/coachActions";
import { formatPracticeQuantity, normalizePracticeQuantityFields, type WeeklyPracticeMetrics } from "@/lib/practiceQuantity";

type ReviewResponse = {
  ok: boolean;
  experiment?: WeeklyExperiment;
  completed?: number;
  target?: number;
  metrics?: WeeklyPracticeMetrics;
  practice_connection?: PracticeConnectionContext;
  queued_coach_action?: CoachActionProposal | null;
  error?: string;
};

const decisions: Array<{ value: ReviewDecision; title: string; description: string; icon: typeof Check }> = [
  { value: "keep", title: "Keep it", description: "Repeat the same practice next week.", icon: Repeat2 },
  { value: "shrink", title: "Make it smaller", description: "Lower the weekly target so it is easier to repeat.", icon: ArrowLeft },
  { value: "swap", title: "Swap it", description: "Choose a different small lifestyle practice.", icon: RefreshCw },
  { value: "pause", title: "Pause", description: "Close this experiment without starting another.", icon: Pause },
  { value: "advance", title: "Build on it", description: "Add one practice completion next week.", icon: TrendingUp },
];

export default function WeeklyReviewClient({ experimentId }: { experimentId: string }) {
  const [experiment, setExperiment] = useState<WeeklyExperiment | null>(null);
  const [completed, setCompleted] = useState(0);
  const [target, setTarget] = useState(1);
  const [metrics, setMetrics] = useState<WeeklyPracticeMetrics | null>(null);
  const [practiceConnection, setPracticeConnection] = useState<PracticeConnectionContext | null>(null);
  const [queuedCoachAction, setQueuedCoachAction] = useState<CoachActionProposal | null>(null);
  const [selectedCoachActionId, setSelectedCoachActionId] = useState<string | null>(null);
  const [coachActionBusy, setCoachActionBusy] = useState(false);
  const [difficulty, setDifficulty] = useState(0);
  const [valueRating, setValueRating] = useState(0);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [nextPlan, setNextPlan] = useState<NextWeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesis, setSynthesis] = useState<WeeklySynthesis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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
        setMetrics(json.metrics ?? null);
        setPracticeConnection(json.practice_connection ?? null);
        setQueuedCoachAction(json.queued_coach_action ?? null);
      })
      .catch((loadError: Error) => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [experimentId, reloadKey]);

  const ready = useMemo(() => difficulty > 0 && valueRating > 0 && !!decision && (decision === "pause" || !!validateNextPlan(nextPlan)), [difficulty, valueRating, decision, nextPlan]);

  function chooseDecision(value: ReviewDecision) {
    setDecision(value);
    setNextPlan(experiment ? suggestedNextPlan(experiment, value) : null);
    setSelectedCoachActionId(null);
  }

  async function requestSuggestion() {
    if (!difficulty || !valueRating) return;
    setSynthesisLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/weekly-review/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiment_id: experimentId, difficulty, value_rating: valueRating }),
      });
      const json = await response.json().catch(() => null) as { ok?: boolean; synthesis?: WeeklySynthesis; error?: string } | null;
      if (!response.ok || !json?.ok || !json.synthesis) throw new Error(reviewError(json?.error));
      setSynthesis(json.synthesis);
    } catch (suggestionError) {
      setError(suggestionError instanceof Error ? suggestionError.message : "The suggestion is unavailable right now.");
    } finally {
      setSynthesisLoading(false);
    }
  }

  function useSuggestion() {
    if (!synthesis) return;
    setDecision(synthesis.suggestedDecision);
    setNextPlan(synthesis.suggestedPlan);
    setSelectedCoachActionId(null);
  }

  function useQueuedCoachAction() {
    if (!queuedCoachAction) return;
    setDecision("swap");
    setNextPlan({
      action_label: queuedCoachAction.actionLabel,
      cue: queuedCoachAction.cue,
      frequency_per_week: queuedCoachAction.frequencyPerWeek,
      target_quantity: null,
      quantity_unit: null,
      minimum_quantity: null,
      minimum_quantity_unit: null,
      minimum_version: queuedCoachAction.minimumVersion,
    });
    setSelectedCoachActionId(queuedCoachAction.id);
  }

  async function removeQueuedCoachAction() {
    if (!queuedCoachAction || coachActionBusy) return;
    setCoachActionBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/coach/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: queuedCoachAction.id, action: "cancel" }),
      });
      if (!response.ok) throw new Error("remove_failed");
      setQueuedCoachAction(null);
      if (selectedCoachActionId === queuedCoachAction.id) {
        setSelectedCoachActionId(null);
        setDecision(null);
        setNextPlan(null);
      }
    } catch {
      setError("That saved coaching idea was not removed. Please try again.");
    } finally {
      setCoachActionBusy(false);
    }
  }

  async function finishReview() {
    if (!ready || !decision) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/weekly-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiment_id: experimentId, difficulty, value_rating: valueRating, decision, next_plan: nextPlan, synthesis_id: synthesis?.id ?? null, coach_action_proposal_id: selectedCoachActionId }),
      });
      const json = await response.json().catch(() => null) as ReviewResponse | null;
      if (!response.ok || !json?.ok) throw new Error(reviewError(json?.error));
      window.location.assign("/today");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your review was not saved.");
      setSaving(false);
    }
  }

  if (loading) return <ReviewShell><div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#087F72]" /></div></ReviewShell>;
  if (!experiment) return (
    <ReviewShell>
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800" role="alert">
        <p>{error ?? "This review is not available."} Your saved week is unchanged.</p>
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-800 hover:bg-rose-100">
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Try loading again
        </button>
      </div>
    </ReviewShell>
  );

  return (
    <ReviewShell>
      <a href="/today" className="inline-flex items-center text-sm font-semibold text-[#087F72] hover:underline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Today</a>
      <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Your weekly review</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#041B2D] sm:text-4xl">Notice what worked. Shape the next week.</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">This is a short experiment review, not a health outcome assessment. Use it to make your practice easier to repeat.</p>

      <section className="mt-8 rounded-3xl bg-[#041B2D] p-6 text-white sm:p-8">
        <p className="text-sm font-semibold text-[#8DE5D5]">This week</p>
        <h2 className="mt-2 text-2xl font-bold">{experiment.action_label}</h2>
        {practiceConnection ? <p className="mt-3 rounded-xl bg-white/10 px-4 py-3 text-sm leading-6 text-white/85"><strong className="text-white">Why it mattered:</strong> {practiceConnection.summary}</p> : null}
        <p className="mt-5 text-4xl font-bold">{completed} <span className="text-lg font-medium text-white/70">of {target} planned times</span></p>
        <p className="mt-2 text-sm text-white/70">Every completed session counts, including the minimum version.</p>
        {metrics?.known_total_quantity != null && metrics.total_quantity_unit ? <p className="mt-3 text-sm font-semibold text-[#8DE5D5]">Known volume: {formatPracticeQuantity(metrics.known_total_quantity, metrics.total_quantity_unit)} across {metrics.completed_sessions} {metrics.completed_sessions === 1 ? "session" : "sessions"}.</p> : null}
      </section>

      <Rating title="How difficult was this practice to repeat?" low="Very easy" high="Very hard" value={difficulty} onChange={(value) => { setDifficulty(value); setSynthesis(null); }} />
      <Rating title="How useful did this practice feel?" low="Not useful" high="Very useful" value={valueRating} onChange={(value) => { setValueRating(value); setSynthesis(null); }} />

      {difficulty && valueRating ? (
        synthesis ? <SynthesisCard synthesis={synthesis} onUse={useSuggestion} /> : (
          <section className="mt-8 rounded-3xl border border-[#BCE3DA] bg-[#F4FAF8] p-6">
            <div className="flex items-start gap-3"><Sparkles className="mt-1 h-5 w-5 shrink-0 text-[#087F72]" aria-hidden="true" /><div><h2 className="text-xl font-bold text-[#041B2D]">Want a grounded suggestion?</h2><p className="mt-2 text-sm leading-6 text-slate-600">LVE360 can reflect your recorded practice completions and ratings, then suggest one adjustable experiment for next week.</p></div></div>
            <button type="button" onClick={() => void requestSuggestion()} disabled={synthesisLoading} className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-[#087F72] bg-white px-4 py-2 text-sm font-bold text-[#087F72] hover:bg-[#EAFBF8] disabled:opacity-60">{synthesisLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Get a grounded suggestion</button>
          </section>
        )
      ) : null}

      {queuedCoachAction ? (
        <section className="mt-8 rounded-3xl border-2 border-[#087F72] bg-[#F4FAF8] p-6 sm:p-8">
          <div className="flex items-start gap-3"><Lightbulb className="mt-1 h-5 w-5 shrink-0 text-[#087F72]" aria-hidden="true" /><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Saved from Ask LVE360</p><h2 className="mt-2 text-xl font-black text-[#041B2D]">An idea you kept for this review</h2></div></div>
          <p className="mt-4 font-bold text-[#041B2D]">{queuedCoachAction.actionLabel}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{queuedCoachAction.rationale}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={useQueuedCoachAction} className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 text-sm font-bold text-white hover:bg-[#06695F]"><Check className="mr-2 h-4 w-4" /> Use this for next week</button>
            <button type="button" onClick={() => void removeQueuedCoachAction()} disabled={coachActionBusy} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-[#486170] hover:border-slate-400 disabled:opacity-50">{coachActionBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />} Remove idea</button>
          </div>
          {selectedCoachActionId === queuedCoachAction.id ? <p className="mt-4 text-sm font-bold text-[#06695F]">Selected below. You can edit the details before finishing your review.</p> : null}
        </section>
      ) : null}

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

function SynthesisCard({ synthesis, onUse }: { synthesis: WeeklySynthesis; onUse: () => void }) {
  const decisionLabel = decisions.find((item) => item.value === synthesis.suggestedDecision)?.title ?? "Try the suggestion";
  return (
    <section className="mt-8 rounded-3xl border border-[#9DCFC3] bg-[#EAFBF8] p-6 sm:p-8">
      <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[#087F72]" aria-hidden="true" /><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">LVE360 weekly reflection</p></div>
      <p className="mt-3 text-xs font-semibold text-[#486170]">{synthesis.historyWeeks ? `Built from this week and ${synthesis.historyWeeks} prior completed ${synthesis.historyWeeks === 1 ? "week" : "weeks"}.` : "Built from this week. Future reviews will add useful context."}</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div><h3 className="font-bold text-[#041B2D]">What the record shows</h3><p className="mt-2 text-sm leading-6 text-slate-700">{synthesis.observation}</p></div>
        <div><h3 className="font-bold text-[#041B2D]">A hypothesis to test</h3><p className="mt-2 text-sm leading-6 text-slate-700">{synthesis.hypothesis}</p><p className="mt-2 text-xs font-semibold text-slate-500">{synthesis.confidence === "low" ? "Low confidence. More completions may change this view." : "Moderate confidence. This is still not proof of cause and effect."}</p></div>
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#D7ECE7] bg-white"><h3 className="border-b border-[#E2EFEC] px-4 py-3 text-sm font-bold text-[#041B2D]">Evidence used</h3><dl className="divide-y divide-[#E8F2F0] text-sm">{synthesis.evidence.map((item) => <div key={item.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]"><dt className="font-semibold text-slate-700">{item.label}</dt><dd className="text-slate-600">{item.value}</dd></div>)}</dl></div>
      <div className="mt-5 rounded-2xl border border-[#9DCFC3] bg-white p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">Smallest next experiment</p><p className="mt-2 text-sm font-bold text-[#041B2D]">{decisionLabel}</p>{synthesis.suggestedPlan ? <p className="mt-1 text-sm text-slate-600">{synthesis.suggestedPlan.action_label}, {synthesis.suggestedPlan.frequency_per_week} times next week. On a hard day: {synthesis.suggestedPlan.minimum_version}.</p> : <p className="mt-1 text-sm text-slate-600">Pause this practice and choose your next focus when ready.</p>}</div>
      <button type="button" onClick={onUse} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 text-sm font-bold text-white hover:bg-[#06695F]"><Check className="mr-2 h-4 w-4" /> Use this suggestion</button>
      <p className="mt-3 text-xs leading-5 text-slate-500">You can edit every field below or choose a different option. Your choice always controls the next week.</p>
    </section>
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
      {swap ? <p className="mt-2 text-sm leading-6 text-slate-600">A different practice starts as an independent choice. After this review, use Review practice in Today if you want to connect it to a saved goal.</p> : null}
      <label className="mt-5 block text-sm font-bold text-[#041B2D]">Practice<input value={plan.action_label} onChange={(event) => onChange({ ...plan, action_label: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label>
      <label className="mt-4 block text-sm font-bold text-[#041B2D]">After I...<input value={plan.cue} onChange={(event) => onChange({ ...plan, cue: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-bold text-[#041B2D]">Target each time<input type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" value={plan.target_quantity ?? ""} onChange={(event) => onChange({ ...plan, target_quantity: event.target.value === "" ? null : Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label>
        <label className="block text-sm font-bold text-[#041B2D]">Unit<input maxLength={40} value={plan.quantity_unit ?? ""} onChange={(event) => onChange({ ...plan, quantity_unit: event.target.value || null })} placeholder="sit-ups, minutes" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label>
        <label className="block text-sm font-bold text-[#041B2D]">Times per week<input type="number" inputMode="numeric" min={1} max={7} step={1} value={plan.frequency_per_week} onChange={(event) => onChange({ ...plan, frequency_per_week: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /><span className="mt-2 block font-normal leading-5 text-slate-500">How often, not how many repetitions.</span></label>
      </div>
      <label className="mt-4 block text-sm font-bold text-[#041B2D]">Minimum version<input value={plan.minimum_version} onChange={(event) => onChange({ ...plan, minimum_version: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#041B2D]">Minimum quantity<input type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" value={plan.minimum_quantity ?? ""} onChange={(event) => onChange({ ...plan, minimum_quantity: event.target.value === "" ? null : Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /></label>
        <label className="block text-sm font-bold text-[#041B2D]">Minimum unit<input maxLength={40} value={plan.minimum_quantity_unit ?? ""} onChange={(event) => onChange({ ...plan, minimum_quantity_unit: event.target.value || null })} placeholder={plan.quantity_unit ?? "seconds, sit-ups"} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal" /><span className="mt-2 block font-normal leading-5 text-slate-500">Use the target unit unless the hard-day version is measured differently.</span></label>
      </div>
      {!readyQuantity(plan) ? <p className="mt-3 text-sm font-semibold text-rose-700">Quantity fields need a positive amount and a unit, or both should be blank.</p> : null}
    </section>
  );
}

function readyQuantity(plan: NextWeekPlan): boolean {
  return normalizePracticeQuantityFields(plan).ok;
}

function ReviewShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] px-4 py-8 sm:px-6"><div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">{children}</div></main>;
}

function reviewError(error?: string): string {
  if (error === "review_not_due") return "Your weekly review opens on the final day of this focused week.";
  if (error === "review_already_completed") return "This week has already been reviewed.";
  if (error === "invalid_next_plan") return "Check your next practice, cue, target, and minimum version.";
  if (error === "weekly_synthesis_unavailable") return "The grounded suggestion is unavailable right now. You can still complete the review yourself.";
  return "Your weekly review is unavailable right now. Please try again.";
}
