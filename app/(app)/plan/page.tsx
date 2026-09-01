import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  History,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { requireTier } from "@/app/_auth/requireTier";
import { formatPlanChangeDate, planChangeSourceLabel } from "@/lib/planHub";
import { getPlanHubData, type PlanHubData } from "@/lib/planHubData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PlanPage() {
  const { user } = await requireTier(["premium", "trial"], { next: "/plan" });
  const plan = await getPlanHubData(user.id);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="rounded-3xl bg-[#041B2D] px-5 py-7 text-white shadow-sm sm:px-8 sm:py-9">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8DE5D5]">Plan</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">
          Your current health plan, connected.
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-200">
          See what you are focusing on, the Practices you are building, what you take, how it is scheduled, and what changed recently.
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]" aria-label="Current focus and safety">
        <CurrentFocusCard plan={plan} />
        <SafetyCard plan={plan} />
      </section>

      <section className="rounded-3xl border border-[#CFE8E2] bg-white p-5 shadow-sm sm:p-7" aria-labelledby="plan-practices-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Practices</p>
            <h2 id="plan-practices-heading" className="mt-1 text-2xl font-bold text-[#041B2D]">What you are building over time</h2>
          </div>
          <Link href="/onboarding" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#9DCFC3] px-4 py-2 text-sm font-bold text-[#06695F] transition hover:bg-[#F1FAF8]">
            Review Practices <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {plan.practices.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {plan.practices.map((practice) => (
              <article key={practice.id} className="rounded-2xl border border-slate-200 bg-[#F8FBFA] p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Active Practice
                </div>
                <h3 className="mt-2 text-lg font-bold text-[#041B2D]">{practice.actionLabel}</h3>
                <dl className="mt-3 grid gap-2 text-sm text-slate-600">
                  <div><dt className="inline font-bold text-slate-800">Cue: </dt><dd className="inline">{practice.cue}</dd></div>
                  <div><dt className="inline font-bold text-slate-800">Weekly target: </dt><dd className="inline">{practice.frequencyPerWeek} times</dd></div>
                  <div><dt className="inline font-bold text-slate-800">On a hard day: </dt><dd className="inline">{practice.minimumVersion}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-[#9DCFC3] bg-[#F4FAF8] p-5">
            <p className="font-bold text-[#041B2D]">No active Practice yet.</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Choose one small action to carry across your weeks.</p>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-[#CFE8E2] bg-white p-5 shadow-sm sm:p-7" aria-labelledby="plan-regimen-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Regimen</p>
            <h2 id="plan-regimen-heading" className="mt-1 text-2xl font-bold text-[#041B2D]">What you currently take</h2>
            <p className="mt-2 text-sm text-slate-600">{plan.regimenCount} active items across your recorded plan.</p>
          </div>
          <Link href="/routine" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#9DCFC3] px-4 py-2 text-sm font-bold text-[#06695F] transition hover:bg-[#F1FAF8]">
            View and edit Routine <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {plan.regimenGroups.map((group) => (
            <article key={group.key} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-[#041B2D]">{group.label}</h3>
                <span className="rounded-full bg-[#EAFBF8] px-2.5 py-1 text-xs font-bold text-[#06695F]">{group.count}</span>
              </div>
              {group.names.length ? (
                <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                  {group.names.map((name) => <li key={name}>{name}</li>)}
                  {group.count > group.names.length ? <li className="font-semibold text-slate-500">And {group.count - group.names.length} more</li> : null}
                </ul>
              ) : <p className="mt-3 text-sm text-slate-500">None recorded.</p>}
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-2xl bg-[#F8FBFA] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">
            <CalendarClock className="h-4 w-4" aria-hidden="true" /> Schedule coverage
          </div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <Metric label="Structured schedules" value={plan.scheduleCoverage.structured} />
            <Metric label="Recorded timing notes" value={plan.scheduleCoverage.recordedTiming} />
            <Metric label="Need timing details" value={plan.scheduleCoverage.needsStructure} attention={plan.scheduleCoverage.needsStructure > 0} />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {plan.scheduleCoverage.asNeeded} item{plan.scheduleCoverage.asNeeded === 1 ? " is" : "s are"} recorded as needed. Routine remains the place to change dose timing and cadence.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-[#CFE8E2] bg-white p-5 shadow-sm sm:p-7" aria-labelledby="plan-changes-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Change history</p>
            <h2 id="plan-changes-heading" className="mt-1 text-2xl font-bold text-[#041B2D]">Recent confirmed changes</h2>
          </div>
          <Link href="/journey" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#9DCFC3] px-4 py-2 text-sm font-bold text-[#06695F] transition hover:bg-[#F1FAF8]">
            Open Journey <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {plan.recentChanges.length ? (
          <ol className="mt-5 divide-y divide-slate-200">
            {plan.recentChanges.map((change) => (
              <li key={change.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                <span className="mt-0.5 rounded-full bg-[#EAFBF8] p-2 text-[#087F72]"><History className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <p className="font-semibold text-[#041B2D]">{change.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatPlanChangeDate(change.createdAt)} · {planChangeSourceLabel(change.source)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-5">
            <p className="font-bold text-[#041B2D]">No confirmed changes recorded yet.</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">New regimen and Practice changes will appear here after you confirm them.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function CurrentFocusCard({ plan }: { plan: PlanHubData }) {
  return (
    <article className="rounded-3xl border border-[#BCE3DA] bg-gradient-to-br from-[#EAFBF8] via-white to-[#F4EEFF] p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">
        <Sparkles className="h-4 w-4" aria-hidden="true" /> Current focus
      </div>
      {plan.focus ? (
        <>
          <h2 className="mt-3 text-2xl font-bold leading-tight text-[#041B2D]">{plan.focus.label}</h2>
          <p className="mt-2 text-sm text-slate-600">From your {plan.focus.source === "practice" ? "active weekly Practice" : "current Blueprint"}.</p>
          {plan.focus.cue ? <p className="mt-4 text-sm"><strong className="text-[#041B2D]">Cue:</strong> <span className="text-slate-600">{plan.focus.cue}</span></p> : null}
          {plan.focus.frequencyPerWeek ? <p className="mt-1 text-sm"><strong className="text-[#041B2D]">Weekly target:</strong> <span className="text-slate-600">{plan.focus.frequencyPerWeek} times</span></p> : null}
          <Link href={plan.focus.source === "practice" ? "/onboarding" : "/blueprints"} className="mt-5 inline-flex min-h-11 items-center gap-2 font-bold text-[#06695F]">
            Review current focus <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </>
      ) : (
        <>
          <h2 className="mt-3 text-2xl font-bold text-[#041B2D]">Choose your next focus</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Start one small Practice or review the priorities in your Blueprint.</p>
          <Link href="/onboarding" className="mt-5 inline-flex min-h-11 items-center gap-2 font-bold text-[#06695F]">Choose a Practice <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </>
      )}
    </article>
  );
}

function SafetyCard({ plan }: { plan: PlanHubData }) {
  const safety = plan.safety;
  const requiresAttention = safety.needsRefresh || safety.status === "error" || (safety.status === "warning" && !safety.acknowledged);
  const title = safety.needsRefresh
    ? "Review after plan changes"
    : safety.status === "safe"
      ? "No material concern identified"
      : safety.status === "warning" && safety.acknowledged
        ? "Safety notes reviewed"
        : safety.status === "warning"
          ? "Safety notes need review"
          : "Safety review unavailable";
  const description = safety.needsRefresh
    ? "Your current plan differs from the latest Blueprint snapshot."
    : safety.status === "safe"
      ? "Your latest Blueprint did not identify a material concern from the information provided."
      : safety.status === "warning" && safety.acknowledged
        ? "You acknowledged the current Blueprint safety notes."
        : safety.status === "warning"
          ? "Your latest Blueprint contains items to review with a clinician or healthcare provider."
          : "Open your Blueprint to confirm the latest safety context.";

  return (
    <article className={`rounded-3xl border p-5 shadow-sm sm:p-6 ${requiresAttention ? "border-amber-300 bg-amber-50" : "border-[#CFE8E2] bg-white"}`}>
      <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] ${requiresAttention ? "text-amber-800" : "text-[#087F72]"}`}>
        {requiresAttention ? <ShieldAlert className="h-4 w-4" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />} Safety status
      </div>
      <h2 className="mt-3 text-xl font-bold text-[#041B2D]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <Link href={safety.stackId ? `/blueprints/${safety.stackId}` : "/blueprints"} className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-[#06695F]">
        Open safety review <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  );
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${attention ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <p className="text-2xl font-bold text-[#041B2D]">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-600">{label}</p>
    </div>
  );
}
