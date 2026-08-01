"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  measuredMetricsForDomain,
  type JourneyCheckIn,
  type JourneyExperiment,
  type JourneyResponse,
  type JourneyReview,
} from "@/lib/journey";
import { blueprintSafetyLabel, type CurrentBlueprintContext, type ExperimentBlueprintContext } from "@/lib/blueprintContext";

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
  const historyWeeks = Math.max(
    distinctWeeks(data.experiments.map((item) => item.week_start)),
    distinctWeeks(data.check_ins.map((item) => item.log_date)),
  );
  const matureHistory = hasFourWeeksOfHistory(data.check_ins, completedReviews);
  const currentDomain = activeExperiment?.identity_direction
    ?? data.experiments.find((item) => item.identity_direction)?.identity_direction
    ?? null;
  const metrics = measuredMetricsForDomain(currentDomain);

  if (!data.experiments.length) {
    return (
      <EmptyState
        title="Your first chapter starts with one focused week."
        body="Choose a small lifestyle practice in Today. Journey will preserve each week, what you learned, and the patterns that become visible over time."
        action="Choose this week's practice"
        href="/today"
      />
    );
  }

  return (
    <div className="space-y-6">
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
          <SummaryStat label="Practice reps" value={String(completionTotal)} />
          <SummaryStat label="Weekly reviews" value={String(completedReviews.length)} />
          <SummaryStat label="Check-in weeks" value={String(distinctWeeks(data.check_ins.map((item) => item.log_date)))} />
        </dl>
      </section>

      {data.blueprint ? <BlueprintJourneyContext blueprint={data.blueprint} /> : null}

      {activeExperiment ? <CurrentChapter experiment={activeExperiment} blueprintContext={data.experiment_blueprints[activeExperiment.id] ?? null} completed={data.completions.filter((item) => item.experiment_id === activeExperiment.id).length} /> : (
        <EmptyState
          title="Ready for a new focused week?"
          body="Your past weeks are saved below. Start another small experiment when you are ready."
          action="Start from Today"
          href="/today"
        />
      )}

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
              review={data.reviews.find((item) => item.experiment_id === experiment.id) ?? null}
              completed={data.completions.filter((item) => item.experiment_id === experiment.id).length}
            />
          ))}
        </ol>
      </section>

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

      <div className="grid gap-6 lg:grid-cols-2">
        <WinsTimeline reviews={completedReviews} completionTotal={completionTotal} />
        <ReviewHistory reviews={completedReviews} experiments={data.experiments} />
      </div>
    </div>
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

function BlueprintPracticeLink({ context, compact = false }: { context: ExperimentBlueprintContext | null; compact?: boolean }) {
  if (!context?.priority_label) {
    return <p className={`${compact ? "mt-2" : "mt-3"} text-xs font-semibold text-slate-500`}>Self-chosen practice. No Blueprint priority link recorded.</p>;
  }
  return (
    <div className={`${compact ? "mt-2" : "mt-3"} rounded-xl ${context.needs_review ? "bg-amber-50 text-amber-900" : "bg-white text-slate-700"} p-3 text-xs leading-5`}>
      <strong>{context.needs_review ? "Review against the current Blueprint:" : "Supports Blueprint priority:"}</strong> {context.priority_label}
      {context.needs_review ? <span className="block mt-1">The practice was preserved and was not automatically changed.</span> : null}
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

function CurrentChapter({ experiment, blueprintContext, completed }: { experiment: JourneyExperiment; blueprintContext: ExperimentBlueprintContext | null; completed: number }) {
  const target = experiment.frequency_per_week ?? 1;
  return (
    <section aria-labelledby="current-chapter-title" className="rounded-3xl border border-[#BCE3DA] bg-[#F4FAF8] p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Current chapter: {domainLabel(experiment.identity_direction)}</p>
          <h2 id="current-chapter-title" className="mt-2 text-2xl font-bold text-[#041B2D]">{experiment.action_label}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            After: {experiment.cue || "your chosen cue"}. Minimum: {experiment.minimum_version || "your smallest version"}.
          </p>
          <BlueprintPracticeLink context={blueprintContext} />
        </div>
        <div className="min-w-48">
          <p className="text-sm font-bold text-[#041B2D]">{completed} of {target} planned reps</p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-white"
            role="progressbar"
            aria-label="Planned repetitions completed"
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

function ExperimentCard({ experiment, blueprintContext, review, completed }: { experiment: JourneyExperiment; blueprintContext: ExperimentBlueprintContext | null; review: JourneyReview | null; completed: number }) {
  const target = review?.target_count ?? experiment.frequency_per_week ?? 1;
  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">
            Week of {formatDate(experiment.week_start)}. {domainLabel(experiment.identity_direction)}
          </p>
          <h3 className="mt-2 font-bold text-[#041B2D]">{experiment.action_label || "Focused weekly practice"}</h3>
          <BlueprintPracticeLink context={blueprintContext} compact />
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${experiment.status === "active" ? "bg-[#DDF7F1] text-[#087F72]" : "bg-slate-200 text-slate-700"}`}>
          {experiment.status === "active" ? "In progress" : experiment.status === "completed" ? "Reviewed" : "Closed"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
        <span>{completed} of {target} reps</span>
        {review?.difficulty ? <span>Difficulty {review.difficulty}/5</span> : null}
        {review?.value_rating ? <span>Usefulness {review.value_rating}/5</span> : null}
        {review?.decision ? <span>{DECISION_LABELS[review.decision]}</span> : null}
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
  const wins = reviews.filter((review) => review.completion_count > 0 || (review.value_rating ?? 0) >= 4 || review.decision === "keep" || review.decision === "advance");
  return (
    <section aria-labelledby="wins-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[#087F72]" aria-hidden="true" /><h2 id="wins-title" className="text-xl font-bold text-[#041B2D]">Wins worth remembering</h2></div>
      {wins.length ? (
        <ul className="mt-5 space-y-4">{wins.map((review) => <li key={review.experiment_id} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#08A88A]" aria-hidden="true" /><div><p className="font-semibold text-[#041B2D]">{review.completion_count} practice reps completed</p><p className="mt-1 text-sm text-slate-600">{review.decision ? DECISION_LABELS[review.decision] : "Captured what worked"}. {formatDate(review.completed_at?.slice(0, 10) ?? "")}</p></div></li>)}</ul>
      ) : (
        <EmptyPanel title={completionTotal ? `${completionTotal} completed ${completionTotal === 1 ? "rep" : "reps"} already count.` : "Your first win can be very small."} body="Complete the minimum version or finish a weekly review. Journey will save the evidence without demanding a perfect streak." />
      )}
    </section>
  );
}

function ReviewHistory({ reviews, experiments }: { reviews: JourneyReview[]; experiments: JourneyExperiment[] }) {
  return (
    <section aria-labelledby="review-history-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2"><Compass className="h-5 w-5 text-[#087F72]" aria-hidden="true" /><h2 id="review-history-title" className="text-xl font-bold text-[#041B2D]">What you learned</h2></div>
      {reviews.length ? (
        <ul className="mt-5 space-y-4">{reviews.map((review) => {
          const experiment = experiments.find((item) => item.id === review.experiment_id);
          return <li key={review.experiment_id} className="rounded-2xl bg-slate-50 p-4"><p className="font-semibold text-[#041B2D]">{experiment?.action_label || "Weekly practice"}</p><p className="mt-2 text-sm leading-6 text-slate-600">Useful {review.value_rating}/5. Difficult {review.difficulty}/5. {review.decision ? DECISION_LABELS[review.decision] : "Reviewed"}.</p></li>;
        })}</ul>
      ) : (
        <EmptyPanel title="Your first weekly reflection will appear here." body="At the end of the week, notice usefulness and difficulty, then decide whether to keep, shrink, swap, pause, or build on the practice." />
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
