"use client";

import Link from "next/link";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  History,
  LineChart,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

import {
  DECISION_LABELS,
  completionRate,
  distinctWeeks,
  domainLabel,
  hasFourWeeksOfHistory,
  journeyChangeDetails,
  journeyPlanChangeForReview,
  journeyReviewDecision,
  journeyDomainSummaries,
  measuredMetricsForDomain,
  type JourneyCheckIn,
  type JourneyExperiment,
  type JourneyPlanChange,
  type JourneyResponse,
  type JourneyReview,
  type JourneySynthesis,
} from "@/lib/journey";
import { formatPlanChangeDate, planChangeSourceLabel } from "@/lib/planHub";
import { blueprintSafetyLabel, type CurrentBlueprintContext, type ExperimentBlueprintContext } from "@/lib/blueprintContext";
import type { PracticeConnectionContext } from "@/lib/practiceConnection";
import { formatPracticeCue, formatPracticeQuantity, isUsableMinimumVersionText } from "@/lib/practiceQuantity";
import { journeySynthesisGrounding, type JourneySynthesisGrounding } from "@/lib/journeyGrounding";

type MetricKey = "sleep" | "energy" | "weight";

const METRICS: Record<MetricKey, { label: string; suffix: string; maximum?: number }> = {
  sleep: { label: "Sleep", suffix: " / 5", maximum: 5 },
  energy: { label: "Energy", suffix: " / 10", maximum: 10 },
  weight: { label: "Weight", suffix: " lb" },
};

export default function JourneyDashboard() {
  const [data, setData] = useState<JourneyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/journey", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => null) as JourneyResponse | null;
        if (!response.ok || !json?.ok) throw new Error("Your Journey is unavailable right now.");
        return json;
      })
      .then((json) => {
        setData(json);
      })
      .catch((loadError: Error) => {
        if (loadError.name !== "AbortError") setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <Loader2 className="h-7 w-7 animate-spin text-[#087F72]" aria-label="Loading Journey" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <h2 className="font-bold">We could not load your Journey.</h2>
        <p className="mt-2 text-sm">{error ?? "Please try again shortly."}</p>
      </div>
    );
  }

  return <JourneyContent data={data} />;
}

function JourneyContent({ data }: { data: JourneyResponse }) {
  const activeExperiment = data.experiments.find((item) => item.status === "active") ?? null;
  const completedReviews = data.reviews.filter((item) => item.status === "completed");
  const completionTotal = data.completions.length;
  const activeCompletionCount = activeExperiment
    ? data.completions.filter((item) => item.experiment_id === activeExperiment.id).length
    : 0;
  const historyWeeks = Math.max(
    distinctWeeks(data.experiments.map((item) => item.week_start)),
    distinctWeeks(data.check_ins.map((item) => item.log_date)),
  );
  const matureHistory = hasFourWeeksOfHistory(data.check_ins, completedReviews);
  const currentDomain = activeExperiment?.identity_direction
    ?? data.experiments.find((item) => item.identity_direction)?.identity_direction
    ?? null;
  const metrics = measuredMetricsForDomain(currentDomain);
  const domainSummaries = journeyDomainSummaries(data.experiments, completedReviews, data.completions);
  const latestReview = completedReviews[0] ?? null;

  if (!data.experiments.length) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="Your first chapter starts with one focused week."
          body="Choose a small lifestyle practice in Today. Journey will preserve each week, what you learned, and the patterns that become visible over time."
          action="Choose this week's practice"
          href="/today"
        />
        <PlanChangeTimeline changes={data.plan_changes} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WeeklyLearningStory
        activeExperiment={activeExperiment}
        activeCompletionCount={activeCompletionCount}
        experiments={data.experiments}
        reviews={completedReviews}
        syntheses={data.syntheses}
        practiceConnections={data.practice_connections}
        experimentBlueprints={data.experiment_blueprints}
        planChanges={data.plan_changes}
      />

      {activeExperiment ? <CurrentChapter experiment={activeExperiment} connection={data.practice_connections[activeExperiment.id]} blueprintContext={data.experiment_blueprints[activeExperiment.id] ?? null} completed={activeCompletionCount} /> : (
        <EmptyState
          title="Ready for a new focused week?"
          body="Your past weeks are saved below. Start another small experiment when you are ready."
          action="Start from Today"
          href="/today"
        />
      )}

      <PlanChangeTimeline changes={data.plan_changes} />

      <SupportingDetail title="Review the Blueprint and next-focus context" description="See how your weekly practice connects to longer-term priorities." id="journey-blueprint-context">
        {data.blueprint ? <BlueprintJourneyContext blueprint={data.blueprint} /> : null}
        <NextFocusPrompt
          activeExperiment={activeExperiment}
          blueprint={data.blueprint}
          experiments={data.experiments}
          experimentBlueprints={data.experiment_blueprints}
          latestReview={latestReview}
        />
      </SupportingDetail>

      <SupportingDetail title="Explore your activity and weekly history" description="Open the counts, life areas, and complete record behind the story." id="journey-week-history">
        <section aria-labelledby="journey-summary-title" className="rounded-3xl bg-[#041B2D] p-6 text-white sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8DE5D5]">Your journey so far</p>
          <h2 id="journey-summary-title" className="mt-2 text-2xl font-bold sm:text-3xl">
            Small weeks become useful evidence.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
            This view helps you remember what you tried and what you noticed. It does not diagnose health changes or prove that one behavior caused an outcome.
          </p>
          <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Weeks started" value={String(data.experiments.length)} />
            <SummaryStat label="Practice completions" value={String(completionTotal)} />
            <SummaryStat label="Weekly reviews" value={String(completedReviews.length)} />
            <SummaryStat label="Check-in weeks" value={String(distinctWeeks(data.check_ins.map((item) => item.log_date)))} />
          </dl>
        </section>

        <DomainProgress summaries={domainSummaries} />

        <section aria-labelledby="experiment-history-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3">
            <History className="mt-1 h-5 w-5 text-[#087F72]" aria-hidden="true" />
            <div>
              <h2 id="experiment-history-title" className="text-2xl font-bold text-[#041B2D]">Your weeks</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">A record of the practices you tested, not a scorecard.</p>
            </div>
          </div>
          <ol className="mt-6 space-y-4">
            {data.experiments.map((experiment) => (
              <ExperimentCard
                key={experiment.id}
                experiment={experiment}
                blueprintContext={data.experiment_blueprints[experiment.id] ?? null}
                connection={data.practice_connections[experiment.id]}
                review={data.reviews.find((item) => item.experiment_id === experiment.id) ?? null}
                completed={data.completions.filter((item) => item.experiment_id === experiment.id).length}
              />
            ))}
          </ol>
        </section>
      </SupportingDetail>

      <SupportingDetail title="Explore check-in patterns" description="Open charts and date-level comparisons when you want the supporting detail." id="journey-check-in-patterns">
        <section aria-labelledby="patterns-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-3">
          <LineChart className="mt-1 h-5 w-5 text-[#087F72]" aria-hidden="true" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">{domainLabel(currentDomain)}</p>
            <h2 id="patterns-title" className="mt-1 text-2xl font-bold text-[#041B2D]">Patterns to notice</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Check-ins can reveal associations worth reflecting on. They cannot establish cause and effect.
            </p>
          </div>
        </div>

        {!matureHistory ? (
          <div className="mt-5 rounded-2xl border border-[#BCE3DA] bg-[#F4FAF8] p-4 text-sm leading-6 text-slate-700">
            <strong className="text-[#041B2D]">Early signal:</strong> you have {historyWeeks} {historyWeeks === 1 ? "week" : "weeks"} of history. Four weeks gives you a more useful comparison, but every honest check-in builds the picture.
          </div>
        ) : null}

        {metrics.length ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {metrics.map((metric) => <MetricTrend key={metric} metric={metric} checkIns={data.check_ins} />)}
          </div>
        ) : (
          <EmptyPanel
            title={`Your current check-ins do not measure ${domainLabel(currentDomain).toLowerCase()} directly.`}
            body="Use weekly reviews to record whether the practice felt useful and repeatable. LVE360 will not turn indirect signals into a diagnostic score."
          />
        )}

        <BehaviorOutcomeTable checkIns={data.check_ins} completionDates={new Set(data.completions.map((item) => item.completion_date))} />
        </section>
      </SupportingDetail>

      <SupportingDetail title="Read past reflections" description="Open earlier wins and weekly learning notes." id="journey-reflections">
        <div className="grid gap-6 lg:grid-cols-2">
          <WinsTimeline reviews={completedReviews} completionTotal={completionTotal} />
          <LearningLoop
            reviews={completedReviews}
            experiments={data.experiments}
            practiceConnections={data.practice_connections}
            syntheses={data.syntheses}
          />
        </div>
      </SupportingDetail>
    </div>
  );
}

function WeeklyLearningStory({ activeExperiment, activeCompletionCount, experiments, reviews, syntheses, practiceConnections, experimentBlueprints, planChanges }: {
  activeExperiment: JourneyExperiment | null;
  activeCompletionCount: number;
  experiments: JourneyExperiment[];
  reviews: JourneyReview[];
  syntheses: JourneySynthesis[];
  practiceConnections: Record<string, PracticeConnectionContext>;
  experimentBlueprints: Record<string, ExperimentBlueprintContext>;
  planChanges: JourneyPlanChange[];
}) {
  const latestReview = reviews[0] ?? null;
  const reviewedExperiment = latestReview
    ? experiments.find((item) => item.id === latestReview.experiment_id) ?? null
    : null;
  const reviewedSynthesis = latestReview
    ? syntheses.find((item) => item.experiment_id === latestReview.experiment_id) ?? null
    : null;
  const chosenNextExperiment = latestReview?.next_experiment_id
    ? experiments.find((item) => item.id === latestReview.next_experiment_id) ?? null
    : null;
  const focusExperiment = reviewedExperiment ?? activeExperiment ?? experiments[0] ?? null;
  const activeAction = sentenceFragment(activeExperiment?.action_label);
  const nextAction = sentenceFragment(chosenNextExperiment?.action_label);
  const confirmedChange = journeyPlanChangeForReview(latestReview, planChanges);
  const changeLabel = confirmedChange ? "What changed (confirmed)" : "What the weekly review recorded";

  const latestReviewDecision = latestReview ? journeyReviewDecision(latestReview) : null;
  const changed = confirmedChange
    ? confirmedChangeSummary(confirmedChange, latestReview?.adaptation_rationale)
    : latestReview
      ? `${latestReviewDecision ? DECISION_LABELS[latestReviewDecision] : "Completed the weekly review"}${nextAction ? `, then chose ${nextAction}` : ""}.`
      : `You started ${activeAction || "a focused weekly practice"}.`;
  const followThrough = latestReview
    ? `You recorded ${latestReview.completion_count} of ${latestReview.target_count} planned ${latestReview.target_count === 1 ? "time" : "times"}.${latestReview.known_total_quantity != null && latestReview.known_total_quantity_unit ? ` Known volume: ${formatPracticeQuantity(latestReview.known_total_quantity, latestReview.known_total_quantity_unit)}.` : ""}`
    : `You have recorded ${activeCompletionCount} of ${activeExperiment?.frequency_per_week ?? 1} planned ${(activeExperiment?.frequency_per_week ?? 1) === 1 ? "time" : "times"} so far.`;
  const learned = reviewedSynthesis?.observation
    ?? (latestReview
      ? describeReviewRatings(latestReview)
      : "There is no completed weekly review yet. Finish the week honestly so LVE360 can summarize what you noticed.");
  const appearsToWork = reviewedSynthesis
    ? `${reviewedSynthesis.hypothesis} This is a ${reviewedSynthesis.confidence}-confidence idea to test, not proof.`
    : describeApparentFit(latestReview);
  const uncertainty = reviewedSynthesis
    ? "This record cannot show that the practice caused a change in sleep, energy, weight, mood, or another health outcome. Other influences may have changed at the same time."
    : "There is not enough reviewed evidence to connect this practice with a health outcome. A completed weekly reflection is the next useful signal.";
  const nextDecision = activeExperiment
    ? `Review ${activeAction || "this practice"} after this week. Compare follow-through, usefulness, and difficulty, then choose the smallest useful adjustment.`
    : nextAction
      ? `Start the next chosen practice: ${nextAction}.`
      : "Choose one small practice for the next week when you are ready.";
  const grounding = reviewedExperiment && latestReview
    ? journeySynthesisGrounding({
      experiment: reviewedExperiment,
      review: latestReview,
      synthesis: reviewedSynthesis ?? null,
      connection: practiceConnections[reviewedExperiment.id] ?? null,
      blueprintContext: experimentBlueprints[reviewedExperiment.id] ?? null,
    })
    : null;

  return (
    <section aria-labelledby="weekly-learning-story-title" className="overflow-hidden rounded-3xl border border-[#9DCFC3] bg-white shadow-sm">
      <div className="bg-[#041B2D] p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8DE5D5]">Your latest weekly story</p>
        <h2 id="weekly-learning-story-title" className="mt-2 text-2xl font-bold sm:text-3xl">Your week, understood.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
          {focusExperiment ? `Week of ${formatDate(focusExperiment.week_start)}. ` : ""}
          LVE360 turns your recorded practice and reflection into one learning story without claiming that the practice caused a health outcome.
        </p>
      </div>
      <ol className="grid gap-px bg-slate-200 md:grid-cols-2">
        <StoryPoint number="1" label={changeLabel} body={changed} meta={confirmedChange ? `${planChangeSourceLabel(confirmedChange.source)} · ${formatPlanChangeDate(confirmedChange.created_at)}` : "Historical review; no linked ledger event"} />
        <StoryPoint number="2" label="What you followed through on" body={followThrough} />
        <StoryPoint number="3" label="What you observed" body={learned} meta="What LVE360 learned begins with member-reported evidence" />
        <StoryPoint number="4" label="What appears to work (uncertain)" body={appearsToWork} meta="Working interpretation, not a causal claim" />
      </ol>
      {grounding ? <JourneyGroundingCard grounding={grounding} /> : null}
      <div className="border-t border-slate-200 bg-amber-50 px-6 py-4 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-900">What remains unknown</p>
        <p className="mt-1 text-sm leading-6 text-amber-950/80">{uncertainty}</p>
      </div>
      <div className="border-t border-slate-200 bg-[#F4FAF8] p-6 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">One next decision</p>
          <p className="mt-2 max-w-2xl font-semibold leading-6 text-[#041B2D]">{nextDecision}</p>
        </div>
        <Link href="/today" className="mt-5 inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[#08A88A] px-5 py-3 text-sm font-bold text-white hover:bg-[#078B74] sm:mt-0">
          {activeExperiment ? "Open this week" : "Choose the next week"}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function JourneyGroundingCard({ grounding }: { grounding: JourneySynthesisGrounding }) {
  function openSupportingDetail(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!href.startsWith("#")) return;
    const target = document.querySelector<HTMLDetailsElement>(href);
    if (!target) return;
    event.preventDefault();
    target.open = true;
    window.history.replaceState(null, "", href);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <aside className="border-t border-slate-200 bg-white p-6 sm:p-8" aria-label="Grounding for this weekly learning">
      <div className="rounded-2xl border border-[#CFE8E2] bg-[#F4FAF8] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">{grounding.title}</p>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${grounding.confidence === "moderate" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
            {grounding.confidenceLabel}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{grounding.summary}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {grounding.sources.map((source) => (
            <Link key={source.kind} href={source.href} onClick={(event) => openSupportingDetail(event, source.href)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-[#9DCFC3] hover:bg-white">
              <span className="flex items-center justify-between gap-2 text-sm font-bold text-[#06695F]">
                {source.label}
                <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">{source.detail}</span>
              {source.status && source.status !== "current" ? (
                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${source.status === "needs_review" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                  {source.status === "needs_review" ? "Needs review" : "Historical connection"}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">{grounding.methodNote}</p>
      </div>
    </aside>
  );
}

function StoryPoint({ number, label, body, meta }: { number: string; label: string; body: string; meta?: string }) {
  return (
    <li className="bg-white p-6 sm:p-7">
      <div className="flex items-start gap-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DDF7F1] text-sm font-bold text-[#087F72]" aria-hidden="true">{number}</span>
        <div>
          <h3 className="font-bold text-[#041B2D]">{label}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
          {meta ? <p className="mt-3 text-xs font-semibold text-[#087F72]">{meta}</p> : null}
        </div>
      </div>
    </li>
  );
}

function confirmedChangeSummary(change: JourneyPlanChange, rationale: string | null | undefined): string {
  const summary = change.change_summary.trim();
  if (!rationale?.trim()) return summary.endsWith(".") ? summary : `${summary}.`;
  const rationaleSuffix = `: ${rationale.trim()}`;
  const rationaleDelimiter = change.source === "weekly_review" ? summary.lastIndexOf(": ") : -1;
  const withoutRepeatedRationale = rationaleDelimiter > 0
    ? summary.slice(0, rationaleDelimiter)
    : summary.endsWith(rationaleSuffix)
      ? summary.slice(0, -rationaleSuffix.length)
      : summary;
  return `${withoutRepeatedRationale}. You chose this because ${sentenceFragment(rationale)}.`;
}

function PlanChangeTimeline({ changes }: { changes: JourneyPlanChange[] }) {
  return (
    <section aria-labelledby="confirmed-changes-title" className="rounded-3xl border border-[#CFE8E2] bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-3">
        <History className="mt-1 h-5 w-5 text-[#087F72]" aria-hidden="true" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Confirmed Plan history</p>
          <h2 id="confirmed-changes-title" className="mt-1 text-2xl font-bold text-[#041B2D]">What actually changed</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            This is the attributable record of changes saved to your Plan. Observations and generated insights remain separate from Plan facts.
          </p>
        </div>
      </div>

      {changes.length ? (
        <ol className="mt-6 divide-y divide-slate-200">
          {changes.slice(0, 6).map((change) => {
            const details = journeyChangeDetails(change).slice(0, 3);
            return (
              <li key={change.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-[#041B2D]">{change.change_summary}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatPlanChangeDate(change.created_at)} · {planChangeSourceLabel(change.source)}</p>
                  </div>
                  <span className="rounded-full bg-[#EAFBF8] px-3 py-1 text-xs font-bold text-[#087F72]">
                    {change.domain === "practice" ? "Practice" : "Regimen"}
                  </span>
                </div>
                {details.length ? (
                  <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {details.map((detail) => (
                      <div key={detail.label} className="rounded-xl bg-slate-50 p-3 text-xs leading-5">
                        <dt className="font-bold uppercase tracking-wide text-slate-500">{detail.label}</dt>
                        <dd className="mt-1 text-slate-600"><span className="line-through decoration-slate-400">{detail.before}</span> <span aria-hidden="true">→</span> <strong className="text-[#041B2D]">{detail.after}</strong></dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <p className="font-bold text-[#041B2D]">No confirmed Plan changes since tracking began.</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">Future regimen and Practice changes will appear here after you confirm them.</p>
        </div>
      )}
    </section>
  );
}

function SupportingDetail({ id, title, description, children }: { id?: string; title: string; description: string; children: ReactNode }) {
  return (
    <details className="group scroll-mt-24 rounded-3xl border border-slate-200 bg-white shadow-sm" id={id}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 marker:content-none sm:p-7">
        <div>
          <h2 className="text-lg font-bold text-[#041B2D]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <span className="text-2xl font-light text-[#087F72] transition-transform group-open:rotate-45" aria-hidden="true">+</span>
      </summary>
      <div className="space-y-6 border-t border-slate-200 bg-slate-50/50 p-4 sm:p-6">{children}</div>
    </details>
  );
}

function sentenceFragment(value: string | null | undefined): string {
  return value?.trim().replace(/[.!?]+$/, "") ?? "";
}

function describeReviewRatings(review: JourneyReview): string {
  const ratings = [
    typeof review.value_rating === "number" ? `${review.value_rating}/5 for usefulness` : null,
    typeof review.difficulty === "number" ? `${review.difficulty}/5 for difficulty` : null,
  ].filter((value): value is string => Boolean(value));
  if (!ratings.length) return "You completed the weekly review without recording usefulness or difficulty ratings.";
  return `You rated the practice ${ratings.join(" and ")}.`;
}

function describeApparentFit(review: JourneyReview | null): string {
  if (!review) return "There is not enough reviewed evidence yet. One honest weekly reflection is the next useful signal.";
  if ((review.value_rating ?? 0) >= 4 && review.completion_count > 0) {
    return "The practice felt useful and was completed at least once. Repeat or adapt it to learn whether that pattern holds.";
  }
  if (["keep", "advance", "continue", "increase", "graduate"].includes(journeyReviewDecision(review) ?? "")) {
    return "Your decision suggests the practice felt worth continuing. Treat that as a personal signal to test again, not proof of an outcome.";
  }
  return "The current evidence does not show a clear fit yet. Your decision to adapt, replace, or pause is useful learning too.";
}

function NextFocusPrompt({ activeExperiment, blueprint, experiments, experimentBlueprints, latestReview }: {
  activeExperiment: JourneyExperiment | null;
  blueprint: CurrentBlueprintContext | null;
  experiments: JourneyExperiment[];
  experimentBlueprints: Record<string, ExperimentBlueprintContext>;
  latestReview: JourneyReview | null;
}) {
  const usedCurrentPriorityIds = new Set(experiments
    .filter((experiment) => experimentBlueprints[experiment.id]?.is_current_blueprint)
    .map((experiment) => experiment.source_action_id)
    .filter((id): id is string => Boolean(id)));
  const actionable = blueprint?.priorities.filter((priority) => priority.kind === "lifestyle") ?? [];
  const suggested = actionable.find((priority) => !usedCurrentPriorityIds.has(priority.id)) ?? actionable[0] ?? null;

  if (activeExperiment) {
    const context = experimentBlueprints[activeExperiment.id] ?? null;
    return (
      <section aria-labelledby="next-focus-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Your next choice</p>
        <h2 id="next-focus-title" className="mt-1 text-2xl font-bold text-[#041B2D]">Learn from this week before adding more.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {latestReview?.decision ? `Your last review: ${DECISION_LABELS[latestReview.decision].toLowerCase()}. ` : ""}
          Complete this week, notice usefulness and difficulty, then choose whether to continue, adapt, replace, pause, or graduate the practice.
        </p>
        {context?.priority_label ? <p className="mt-4 rounded-2xl bg-[#F4FAF8] p-4 text-sm text-slate-700"><strong className="text-[#041B2D]">Current Blueprint connection:</strong> {context.priority_label}</p> : null}
      </section>
    );
  }

  if (!blueprint || !suggested) return null;
  return (
    <section aria-labelledby="next-focus-title" className="rounded-3xl border border-[#BCE3DA] bg-[#F4FAF8] p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">A possible next focus</p>
      <h2 id="next-focus-title" className="mt-1 text-2xl font-bold text-[#041B2D]">Return to a current Blueprint priority.</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        {latestReview?.decision ? `Your last review: ${DECISION_LABELS[latestReview.decision].toLowerCase()}. ` : ""}
        Based on that review and your current Blueprint, this is one option to consider next.
      </p>
      <p className="mt-4 rounded-2xl bg-white p-4 font-semibold text-[#041B2D]">{suggested.label}</p>
      <Link href={`/blueprints/${blueprint.stack_id}`} className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-[#08A88A] px-5 py-3 text-sm font-bold text-white hover:bg-[#078B74]">
        Review this priority <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

function DomainProgress({ summaries }: { summaries: ReturnType<typeof journeyDomainSummaries> }) {
  return (
    <section aria-labelledby="domain-progress-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Progress by life area</p>
      <h2 id="domain-progress-title" className="mt-1 text-2xl font-bold text-[#041B2D]">Where you have been practicing</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">These are activity summaries, not grades. A quieter life area is not a failure or a recommendation.</p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((summary) => (
          <li key={summary.domain} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-bold text-[#041B2D]">{domainLabel(summary.domain)}</h3>
            <p className="mt-2 text-sm text-slate-600">{summary.weeks} {summary.weeks === 1 ? "week" : "weeks"}. {summary.completions} practice {summary.completions === 1 ? "completion" : "completions"}. {summary.reviews} {summary.reviews === 1 ? "review" : "reviews"}.</p>
            {summary.latest_decision ? <p className="mt-2 text-xs font-semibold text-[#087F72]">Latest choice: {DECISION_LABELS[summary.latest_decision]}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BlueprintJourneyContext({ blueprint }: { blueprint: CurrentBlueprintContext }) {
  return (
    <section className="rounded-3xl border border-[#BCE3DA] bg-[#F4FAF8] p-6 sm:p-8" aria-labelledby="journey-blueprint-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Current Blueprint</p>
          <h2 id="journey-blueprint-title" className="mt-1 text-2xl font-bold text-[#041B2D]">The priorities your weeks can support</h2>
          <p className={`mt-2 text-sm ${blueprint.needs_refresh || blueprint.safety_status !== "safe" ? "font-semibold text-amber-800" : "text-slate-600"}`}>
            {blueprintSafetyLabel(blueprint)}. Refreshed {formatDateTime(blueprint.created_at)}.
          </p>
        </div>
        <Link href={`/blueprints/${blueprint.stack_id}`} className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border border-[#9DCFC3] bg-white px-4 py-3 text-sm font-bold text-[#06695F] hover:bg-[#EAFBF8]">
          Open current Blueprint <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <ul className="mt-5 grid gap-3 lg:grid-cols-3">
        {blueprint.priorities.slice(0, 3).map((priority) => (
          <li key={priority.id} className="rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700">
            <div className="flex items-start gap-2">
              {priority.kind === "review_only" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-label="Review only" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#087F72]" aria-hidden="true" />}
              <span>{priority.label}</span>
            </div>
            {priority.kind === "review_only" ? <p className="mt-2 text-xs font-semibold text-amber-800">Review only. This cannot become a practice.</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PracticeConnectionLabel({ connection, blueprintContext, compact = false }: { connection: PracticeConnectionContext | undefined; blueprintContext: ExperimentBlueprintContext | null; compact?: boolean }) {
  if (!connection) return <p className={`${compact ? "mt-2" : "mt-3"} text-xs font-semibold text-slate-500`}>Practice connection unavailable.</p>;
  return (
    <div className={`${compact ? "mt-2" : "mt-3"} rounded-xl ${blueprintContext?.needs_review ? "bg-amber-50 text-amber-900" : "bg-white text-slate-700"} p-3 text-xs leading-5`}>
      <strong>Why it matters:</strong> {connection.summary}
      {blueprintContext?.needs_review ? <span className="mt-1 block">The practice was preserved and was not automatically changed.</span> : null}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <dt className="text-xs font-semibold text-white/65">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
    </div>
  );
}

function CurrentChapter({ experiment, connection, blueprintContext, completed }: { experiment: JourneyExperiment; connection: PracticeConnectionContext | undefined; blueprintContext: ExperimentBlueprintContext | null; completed: number }) {
  const target = experiment.frequency_per_week ?? 1;
  const minimum = isUsableMinimumVersionText(experiment.minimum_version)
    ? experiment.minimum_version
    : "not reliably recorded; review your weekly plan";
  return (
    <section aria-labelledby="current-chapter-title" className="rounded-3xl border border-[#BCE3DA] bg-[#F4FAF8] p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Current chapter: {domainLabel(experiment.identity_direction)}</p>
          <h2 id="current-chapter-title" className="mt-2 text-2xl font-bold text-[#041B2D]">{experiment.action_label}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {formatPracticeCue(experiment.cue)}. Minimum: {minimum}.
          </p>
          <PracticeConnectionLabel connection={connection} blueprintContext={blueprintContext} />
        </div>
        <div className="min-w-48">
          <p className="text-sm font-bold text-[#041B2D]">{completed} of {target} planned times</p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-white"
            role="progressbar"
            aria-label="Planned practice completions"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completionRate(completed, target)}
          >
            <div className="h-full rounded-full bg-[#08A88A]" style={{ width: `${completionRate(completed, target)}%` }} />
          </div>
          <Link href="/today" className="mt-4 inline-flex items-center text-sm font-bold text-[#087F72] hover:underline">
            Open Today <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ExperimentCard({ experiment, connection, blueprintContext, review, completed }: { experiment: JourneyExperiment; connection: PracticeConnectionContext | undefined; blueprintContext: ExperimentBlueprintContext | null; review: JourneyReview | null; completed: number }) {
  const target = review?.target_count ?? experiment.frequency_per_week ?? 1;
  const reviewDecision = review ? journeyReviewDecision(review) : null;
  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">
            Week of {formatDate(experiment.week_start)}. {domainLabel(experiment.identity_direction)}
          </p>
          <h3 className="mt-2 font-bold text-[#041B2D]">{experiment.action_label || "Focused weekly practice"}</h3>
          <PracticeConnectionLabel connection={connection} blueprintContext={blueprintContext} compact />
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${experiment.status === "active" ? "bg-[#DDF7F1] text-[#087F72]" : "bg-slate-200 text-slate-700"}`}>
          {experiment.status === "active" ? "In progress" : experiment.status === "completed" ? "Reviewed" : "Closed"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
        <span>{completed} of {target} completions</span>
        {review?.difficulty ? <span>Difficulty {review.difficulty}/5</span> : null}
        {review?.value_rating ? <span>Usefulness {review.value_rating}/5</span> : null}
        {reviewDecision ? <span>{DECISION_LABELS[reviewDecision]}</span> : null}
      </div>
    </li>
  );
}

function MetricTrend({ metric, checkIns }: { metric: MetricKey; checkIns: JourneyCheckIn[] }) {
  const definition = METRICS[metric];
  const points = checkIns
    .map((item) => ({ date: item.log_date, value: item[metric] }))
    .filter((item): item is { date: string; value: number } => typeof item.value === "number")
    .slice(-12);

  if (points.length < 2) {
    return <EmptyPanel title={`Keep logging ${definition.label.toLowerCase()}.`} body={`Add at least two ${definition.label.toLowerCase()} check-ins to see the direction over time.`} />;
  }

  const values = points.map((item) => item.value);
  const min = definition.maximum ? 0 : Math.min(...values);
  const max = definition.maximum ?? Math.max(...values);
  const range = max - min || 1;
  const summary = `${definition.label} check-ins from ${formatDate(points[0].date)} to ${formatDate(points[points.length - 1].date)}. Latest value ${formatMetric(points[points.length - 1].value, metric)}.`;

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#041B2D]">{definition.label}</h3>
          <p className="mt-1 text-xs text-slate-500">{points.length} check-ins</p>
        </div>
        <p className="text-lg font-bold text-[#087F72]">{formatMetric(points[points.length - 1].value, metric)}</p>
      </div>
      <div role="img" aria-label={summary} className="mt-5 flex h-32 items-end gap-2 border-b border-slate-300 px-1">
        {points.map((point) => (
          <div key={point.date} className="flex min-w-0 flex-1 items-end self-stretch" aria-hidden="true">
            <div
              className="w-full rounded-t-md bg-[#5CC9B6]"
              style={{ height: `${Math.max(8, ((point.value - min) / range) * 100)}%` }}
              title={`${formatDate(point.date)}: ${formatMetric(point.value, metric)}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{formatShortDate(points[0].date)}</span>
        <span>{formatShortDate(points[points.length - 1].date)}</span>
      </div>
      <table className="sr-only">
        <caption>{definition.label} check-in history</caption>
        <thead><tr><th>Date</th><th>Value</th></tr></thead>
        <tbody>{points.map((point) => <tr key={point.date}><td>{formatDate(point.date)}</td><td>{formatMetric(point.value, metric)}</td></tr>)}</tbody>
      </table>
    </article>
  );
}

function BehaviorOutcomeTable({ checkIns, completionDates }: { checkIns: JourneyCheckIn[]; completionDates: Set<string> }) {
  const rows = checkIns.filter((item) => completionDates.has(item.log_date)).slice(-7);
  return (
    <div className="mt-7 rounded-2xl border border-slate-200 p-5">
      <h3 className="font-bold text-[#041B2D]">Behavior and check-in overlap</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        This compares dates, not causes. Sleep, energy, weight, medication, illness, work, and many other factors can move together.
      </p>
      {!rows.length ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          No dates include both a completed practice and a check-in yet. Complete a practice in Today and log how you feel to begin this comparison.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Dates with both a completed practice and a daily check-in</caption>
            <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-2">Date</th><th className="pb-2">Practice</th><th className="pb-2">Sleep</th><th className="pb-2">Energy</th><th className="pb-2">Weight</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.log_date} className="border-t border-slate-200"><td className="py-3">{formatDate(row.log_date)}</td><td className="py-3 font-semibold text-[#087F72]">Completed</td><td className="py-3">{formatNullable(row.sleep, " / 5")}</td><td className="py-3">{formatNullable(row.energy, " / 10")}</td><td className="py-3">{formatNullable(row.weight, " lb")}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WinsTimeline({ reviews, completionTotal }: { reviews: JourneyReview[]; completionTotal: number }) {
  const wins = reviews.filter((review) => review.completion_count > 0 || (review.value_rating ?? 0) >= 4 || ["keep", "advance", "continue", "increase", "graduate"].includes(journeyReviewDecision(review) ?? ""));
  return (
    <section aria-labelledby="wins-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[#087F72]" aria-hidden="true" /><h2 id="wins-title" className="text-xl font-bold text-[#041B2D]">Wins worth remembering</h2></div>
      {wins.length ? (
        <ul className="mt-5 space-y-4">{wins.map((review) => {
          const decision = journeyReviewDecision(review);
          return <li key={review.experiment_id} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#08A88A]" aria-hidden="true" /><div><p className="font-semibold text-[#041B2D]">{review.completion_count} practice {review.completion_count === 1 ? "completion" : "completions"}</p><p className="mt-1 text-sm text-slate-600">{decision ? DECISION_LABELS[decision] : "Captured what worked"}. {formatDate(review.completed_at?.slice(0, 10) ?? "")}</p></div></li>;
        })}</ul>
      ) : (
        <EmptyPanel title={completionTotal ? `${completionTotal} practice ${completionTotal === 1 ? "completion" : "completions"} already count.` : "Your first win can be very small."} body="Complete the minimum version or finish a weekly review. Journey will save the evidence without demanding a perfect streak." />
      )}
    </section>
  );
}

function LearningLoop({ reviews, experiments, practiceConnections, syntheses }: { reviews: JourneyReview[]; experiments: JourneyExperiment[]; practiceConnections: Record<string, PracticeConnectionContext>; syntheses: JourneySynthesis[] }) {
  const synthesisByExperiment = new Map(syntheses.map((item) => [item.experiment_id, item]));
  return (
    <section aria-labelledby="review-history-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2"><Compass className="h-5 w-5 text-[#087F72]" aria-hidden="true" /><h2 id="review-history-title" className="text-xl font-bold text-[#041B2D]">Your learning loop</h2></div>
      {reviews.length ? (
        <ul className="mt-5 space-y-4">{reviews.map((review) => {
          const experiment = experiments.find((item) => item.id === review.experiment_id);
          const nextExperiment = experiments.find((item) => item.id === review.next_experiment_id) ?? null;
          const connection = experiment ? practiceConnections[experiment.id] : null;
          const synthesis = synthesisByExperiment.get(review.experiment_id) ?? null;
          const decision = journeyReviewDecision(review);
          return <li key={review.experiment_id} className="rounded-2xl bg-slate-50 p-4">
            <dl className="space-y-3 text-sm leading-6">
              <div><dt className="text-xs font-bold uppercase tracking-wide text-[#087F72]">Tried</dt><dd className="font-semibold text-[#041B2D]">{experiment?.action_label || "Weekly practice"}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-[#087F72]">Why it mattered</dt><dd className="text-slate-600">{connection?.summary ?? "No explicit connection was recorded for this week."}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-[#087F72]">Noticed</dt><dd className="text-slate-600">You reported usefulness {review.value_rating}/5 and difficulty {review.difficulty}/5 after completing the practice {review.completion_count} of {review.target_count} planned times.{review.known_total_quantity != null && review.known_total_quantity_unit ? ` Known volume: ${formatPracticeQuantity(review.known_total_quantity, review.known_total_quantity_unit)}.` : ""}</dd></div>
              {synthesis ? <><div><dt className="text-xs font-bold uppercase tracking-wide text-[#087F72]">Recorded observation</dt><dd className="text-slate-600">{synthesis.observation}</dd></div><div><dt className="text-xs font-bold uppercase tracking-wide text-[#087F72]">Working hypothesis</dt><dd className="text-slate-600">{synthesis.hypothesis} <span className="font-semibold">This is a {synthesis.confidence}-confidence idea to test, not proof.</span></dd></div></> : null}
              <div><dt className="text-xs font-bold uppercase tracking-wide text-[#087F72]">Chose next</dt><dd className="text-slate-600">{decision ? DECISION_LABELS[decision] : "Reviewed"}{nextExperiment?.action_label ? `: ${nextExperiment.action_label}` : "."}</dd></div>
              {review.adaptation_rationale ? <div><dt className="text-xs font-bold uppercase tracking-wide text-[#087F72]">Why</dt><dd className="text-slate-600">{review.adaptation_rationale}</dd></div> : null}
            </dl>
          </li>;
        })}</ul>
      ) : (
        <EmptyPanel title="Your first weekly reflection will appear here." body="At the end of the week, notice usefulness and difficulty, then decide whether to continue, decrease, increase, modify, pause, replace, or graduate the practice." />
      )}
    </section>
  );
}

function EmptyState({ title, body, action, href }: { title: string; body: string; action: string; href: string }) {
  return (
    <section className="rounded-3xl border border-dashed border-[#9DCFC3] bg-[#F4FAF8] p-6 sm:p-8">
      <h2 className="text-xl font-bold text-[#041B2D]">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{body}</p>
      <Link href={href} className="mt-5 inline-flex items-center rounded-xl bg-[#08A88A] px-4 py-3 text-sm font-bold text-white hover:bg-[#078B74]">{action}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
    </section>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5"><h3 className="font-bold text-[#041B2D]">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{body}</p></div>;
}

function formatDate(value: string): string {
  if (!value) return "Date unavailable";
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatShortDate(value: string): string {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatMetric(value: number, metric: MetricKey): string {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded}${METRICS[metric].suffix}`;
}

function formatNullable(value: number | null, suffix: string): string {
  if (typeof value !== "number") return "Not logged";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
