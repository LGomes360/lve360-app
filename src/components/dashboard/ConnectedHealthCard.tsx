import Link from "next/link";
import { ArrowRight, BedDouble, Dumbbell, FlaskConical, HeartHandshake, Utensils } from "lucide-react";

import type { ConnectedHealthSummary } from "@/lib/connectedHealth";
import type { ApprovedHealthContextHandoff } from "@/lib/healthContextHandoff";
import {
  buildHealthPicture,
  type HealthPictureCheckIn,
  type HealthPictureLabSummary,
  type HealthPictureSource,
} from "@/lib/healthPicture";

export default function ConnectedHealthCard({
  summary,
  checkIn,
  weightUnit,
  labSummary = null,
  handoff = null,
}: {
  summary: ConnectedHealthSummary | null;
  checkIn: HealthPictureCheckIn | null;
  weightUnit: "lb" | "kg";
  labSummary?: HealthPictureLabSummary | null;
  handoff?: ApprovedHealthContextHandoff | null;
}) {
  const picture = buildHealthPicture({ connectedHealth: summary, checkIn, weightUnit, labSummary, handoff });
  const icons = {
    sleep: BedDouble,
    movement: Dumbbell,
    nutrition_weight: Utensils,
    overall_feeling: HeartHandshake,
    lab_balance: FlaskConical,
  } as const;

  return (
    <section aria-labelledby="health-picture-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Health context</p>
          <h2 id="health-picture-title" className="mt-1 text-xl font-black text-[#041B2D]">Your health picture for today</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{picture.guidance}</p>
        </div>
        {summary?.latest ? (
          <p className="rounded-full bg-[#EAFBF8] px-3 py-1.5 text-xs font-bold text-[#06695F]">
            Connected data: {formatDate(summary.latest.local_date)}
          </p>
        ) : null}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {picture.domains.map((domain) => {
          const Icon = icons[domain.key];
          return (
            <div key={domain.key} className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${domain.key === "lab_balance" ? "sm:col-span-2" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[#087F72]" aria-hidden="true" />
                  <p className="font-bold text-[#041B2D]">{domain.label}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sourceStyle(domain.source)}`}>{domain.sourceLabel}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{domain.summary}</p>
            </div>
          );
        })}
      </div>
      {handoff?.proposedFocus ? (
        <div className="mt-4 rounded-2xl border border-[#BCE3DA] bg-[#F4FAF8] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">Approved focus to consider</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#041B2D]">{handoff.proposedFocus}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">This adds context; your check-in and saved Plan still determine what LVE360 puts first today.</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {summary?.lastSyncCompletedAt ? `Connected data last received ${formatTimestamp(summary.lastSyncCompletedAt)}. ` : ""}
          LVE360 stores bounded summaries, not raw records or workout routes.
        </p>
        <Link href="/settings#health-context" className="inline-flex shrink-0 items-center font-bold text-[#087F72] hover:underline">
          How health context works <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function sourceStyle(source: HealthPictureSource): string {
  if (source === "combined") return "bg-[#DDF6EF] text-[#06695F]";
  if (source === "member_reported") return "bg-[#EDE9FE] text-[#5B21B6]";
  if (source === "connected_data") return "bg-sky-100 text-sky-800";
  if (source === "approved_handoff") return "bg-teal-100 text-teal-800";
  if (source === "lab_summary") return "bg-amber-100 text-amber-900";
  return "bg-slate-200 text-slate-600";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function formatTimestamp(value: string | null): string {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
