import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleMinus,
  CirclePlus,
  FileClock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import type {
  BlueprintDelta,
  BlueprintDeltaKind,
  BlueprintRecommendationDelta,
} from "@/lib/blueprintDelta";

export default function BlueprintDeltaPanel({ delta, stale }: { delta: BlueprintDelta; stale: boolean }) {
  const material = delta.recommendations.filter((item) => item.kind !== "unchanged");
  const stable = delta.recommendations.filter((item) => item.kind === "unchanged");

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-[#9DCFC3] bg-white shadow-sm" aria-labelledby="blueprint-delta-title">
      <div className="border-b border-[#CFE8E2] bg-[#F0FAF7] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Blueprint change intelligence</p>
            <h2 id="blueprint-delta-title" className="mt-1 text-2xl font-bold text-[#041B2D]">Since your last Blueprint</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Compared with {formatDate(delta.previousCreatedAt)}. This summary reads the two saved reports and does not guess why your health information changed.
            </p>
            {delta.generationReason === "member-refresh" ? (
              <p className="mt-1 text-sm font-semibold text-slate-700">The current version was created from a member-requested refresh.</p>
            ) : null}
          </div>
          <Link
            href={`/blueprints/${encodeURIComponent(delta.previousStackId)}`}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-[#9DCFC3] bg-white px-4 py-2 text-sm font-bold text-[#087F72] hover:bg-[#EAFBF8]"
          >
            <FileClock className="mr-2 h-4 w-4" aria-hidden="true" />
            Open prior version
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Recommendation change counts">
          <DeltaCount label="New" count={delta.counts.added} tone="emerald" />
          <DeltaCount label="Updated" count={delta.counts.changed} tone="blue" />
          <DeltaCount label="No longer listed" count={delta.counts.removed} tone="slate" />
          <DeltaCount label="Stable" count={delta.counts.unchanged} tone="slate" />
        </div>
      </div>

      {stale ? (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950 sm:px-6">
          Your saved health information has changed again since this report was created. Refresh the Blueprint before using this comparison for current decisions.
        </div>
      ) : null}

      <div className="p-5 sm:p-6">
        <SafetyDelta delta={delta} />

        <div className="mt-6">
          <h3 className="text-lg font-bold text-[#041B2D]">Changes to review</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            New and updated options still require your decision. Items that disappeared are shown for transparency only.
          </p>
          {material.length ? (
            <ul className="mt-4 space-y-3">
              {material.map((item) => <DeltaCard key={item.key} item={item} previousStackId={delta.previousStackId} />)}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              No recommendations were added, removed, or materially updated in this version.
            </p>
          )}
        </div>

        {stable.length ? (
          <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#041B2D]">
              {stable.length} stable {stable.length === 1 ? "recommendation" : "recommendations"}
            </summary>
            <ul className="border-t border-slate-200 px-4 py-2">
              {stable.map((item) => (
                <li key={item.key} className="flex flex-col gap-2 border-b border-slate-200 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-[#041B2D]">{item.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.explanation}</p>
                  </div>
                  <a href="#recommendation-report" className="shrink-0 text-sm font-bold text-[#087F72] hover:underline">Review detail</a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <p className="mt-5 text-xs leading-5 text-slate-500">
          Full report language, evidence, and PDFs remain available in each dated Blueprint. Safety status comes from LVE360&apos;s deterministic report review, not from generated change-summary language.
        </p>
      </div>
    </section>
  );
}

function SafetyDelta({ delta }: { delta: BlueprintDelta }) {
  const needsReview = delta.safety.needsReview;
  return (
    <div className={`rounded-xl border p-4 ${needsReview ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex items-start gap-3">
        {needsReview
          ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`font-bold ${needsReview ? "text-amber-950" : "text-emerald-950"}`}>Safety review</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${delta.safety.changed ? "bg-blue-100 text-blue-900" : "bg-white/80 text-slate-700"}`}>
              {delta.safety.changed ? "Status changed" : "Status stable"}
            </span>
          </div>
          <p className={`mt-1 text-sm leading-6 ${needsReview ? "text-amber-900" : "text-emerald-900"}`}>{delta.safety.explanation}</p>
          <a href="#safety-notes" className={`mt-2 inline-flex min-h-10 items-center text-sm font-bold hover:underline ${needsReview ? "text-amber-900" : "text-emerald-900"}`}>
            {needsReview ? "Review current safety notes" : "Read current safety notes"}
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}

function DeltaCard({ item, previousStackId }: { item: BlueprintRecommendationDelta; previousStackId: string }) {
  const style = deltaStyle(item.kind);
  const Icon = style.icon;
  const actionHref = item.kind === "removed" ? `/blueprints/${encodeURIComponent(previousStackId)}#recommendation-report` : item.actionHref;
  const details = item.kind === "changed" ? changedDetails(item) : currentDetails(item);

  return (
    <li className={`rounded-xl border p-4 ${style.card}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-[#041B2D]">{item.name}</h4>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style.badge}`}>{style.label}</span>
            {item.attention === "clinician_review" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Clinician review</span>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{item.explanation}</p>
          {details.length ? (
            <dl className="mt-3 grid gap-2 rounded-lg bg-white/80 p-3 text-sm sm:grid-cols-2">
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{detail.label}</dt>
                  <dd className="mt-0.5 text-slate-700">{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {actionHref.startsWith("/") ? (
              <Link href={actionHref} className="inline-flex min-h-10 items-center text-sm font-bold text-[#087F72] hover:underline">
                {item.actionLabel}<ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <a href={actionHref} className="inline-flex min-h-10 items-center text-sm font-bold text-[#087F72] hover:underline">
                {item.actionLabel}<ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </a>
            )}
            {item.kind !== "removed" ? <a href="#report-evidence-references" className="inline-flex min-h-10 items-center text-sm font-semibold text-slate-600 hover:text-[#087F72] hover:underline">See evidence</a> : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function currentDetails(item: BlueprintRecommendationDelta): Array<{ label: string; value: string }> {
  if (!item.current || item.kind === "removed") return [];
  return [
    item.current.status ? { label: "Current status", value: item.current.status } : null,
    item.current.dose ? { label: "Starting guidance", value: item.current.dose } : null,
    item.current.timing ? { label: "Timing", value: item.current.timing } : null,
  ].filter((detail): detail is { label: string; value: string } => Boolean(detail));
}

function changedDetails(item: BlueprintRecommendationDelta): Array<{ label: string; value: string }> {
  if (!item.previous || !item.current) return [];
  const fields = item.changedFields.filter((field) => field !== "name");
  return fields.flatMap((field) => {
    const label = field === "dose"
      ? "Starting guidance"
      : field === "timing"
        ? "Timing"
        : field === "rationale"
          ? "Report rationale"
          : "Review status";
    return [
      { label: `Previous ${label.toLowerCase()}`, value: item.previous?.[field] || "Not recorded" },
      { label: `Current ${label.toLowerCase()}`, value: item.current?.[field] || "Not recorded" },
    ];
  });
}

function DeltaCount({ label, count, tone }: { label: string; count: number; tone: "emerald" | "blue" | "slate" }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    slate: "border-slate-200 bg-white text-slate-800",
  };
  return (
    <div className={`rounded-xl border px-3 py-3 ${tones[tone]}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="mt-0.5 text-xs font-semibold">{label}</p>
    </div>
  );
}

function deltaStyle(kind: BlueprintDeltaKind) {
  if (kind === "added") return { label: "New", card: "border-emerald-200 bg-emerald-50/60", badge: "bg-emerald-100 text-emerald-900", icon: CirclePlus, iconClass: "text-emerald-700" };
  if (kind === "changed") return { label: "Updated", card: "border-blue-200 bg-blue-50/60", badge: "bg-blue-100 text-blue-900", icon: RefreshCw, iconClass: "text-blue-700" };
  if (kind === "removed") return { label: "No longer listed", card: "border-slate-200 bg-slate-50", badge: "bg-slate-200 text-slate-700", icon: CircleMinus, iconClass: "text-slate-500" };
  return { label: "Stable", card: "border-slate-200 bg-slate-50", badge: "bg-slate-200 text-slate-700", icon: CheckCircle2, iconClass: "text-slate-500" };
}

function formatDate(value: string | null): string {
  if (!value) return "the prior saved version";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "the prior saved version";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
