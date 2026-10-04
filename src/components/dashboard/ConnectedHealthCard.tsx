import Link from "next/link";
import { ArrowRight, BedDouble, Dumbbell, FlaskConical, HeartHandshake, Utensils } from "lucide-react";

import type { ConnectedHealthSummary } from "@/lib/connectedHealth";
import type { ApprovedHealthContextHandoff } from "@/lib/healthContextHandoff";
import type { ImportedHealthSummary } from "@/lib/importedHealthContext";
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
  importedRecords = null,
}: {
  summary: ConnectedHealthSummary | null;
  checkIn: HealthPictureCheckIn | null;
  weightUnit: "lb" | "kg";
  labSummary?: HealthPictureLabSummary | null;
  handoff?: ApprovedHealthContextHandoff | null;
  importedRecords?: ImportedHealthSummary | null;
}) {
  const picture = buildHealthPicture({ connectedHealth: summary, checkIn, weightUnit, labSummary, handoff, importedRecords });
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
        <div className="flex flex-wrap justify-end gap-2">
          {summary?.latest ? (
            <p className="rounded-full bg-[#EAFBF8] px-3 py-1.5 text-xs font-bold text-[#06695F]">
              Connected data: {formatDate(summary.latest.local_date)}
            </p>
          ) : null}
          {handoff ? (
            <p className="rounded-full bg-teal-100 px-3 py-1.5 text-xs font-bold text-teal-800">
              ChatGPT Health · 5 areas · {formatDate(handoff.sourceWindow.start)}–{formatDate(handoff.sourceWindow.end)} · snapshot {formatDate(handoff.snapshotDate)}
            </p>
          ) : null}
          {importedRecords ? (
            <p className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800">
              Imported records · {importedRecords.lastMeasurementDate ?? "dated source records"} · not live sync
            </p>
          ) : null}
        </div>
      </div>
      {importedRecords ? (
        <details className="mt-4 rounded-2xl border border-slate-200 p-4 text-sm">
          <summary className="cursor-pointer font-bold text-[#087F72]">Review imported results and limitations</summary>
          <p className="mt-3 text-xs leading-5 text-slate-500">Imported {importedRecords.importedAt}. Collection dates below are the measurement dates, not today's values.</p>
          {importedRecords.labs ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="pb-2 text-left text-slate-600">Latest collection: {importedRecords.labs.lastDate} · showing {importedRecords.labs.latestResults.length} of {importedRecords.labs.latestResultCount} results (source flags first)</caption>
                <thead><tr>{["Marker", "Result", "Source flag", "Reference interval", "Fasting"].map((label) => <th key={label} scope="col" className="border-b p-2 font-bold">{label}</th>)}</tr></thead>
                <tbody>{importedRecords.labs.latestResults.map((result, index) => (
                  <tr key={`${result.marker}-${index}`}>
                    <td className="border-b p-2">{result.marker}<span className="mt-1 block text-slate-500">{result.sourceFile ?? "Source filename unavailable"}</span></td>
                    <td className="border-b p-2">{result.value} {result.units}</td>
                    <td className="border-b p-2">{result.flag ?? "Not supplied"}</td>
                    <td className="border-b p-2">{result.referenceInterval ?? "Not supplied"}</td>
                    <td className="border-b p-2">{result.fasting ?? "Unknown"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}
          {importedRecords.sleep ? (
            <div className="mt-4 text-xs leading-5 text-slate-600">
              <h3 className="font-bold text-[#041B2D]">Archived sleep-device reports</h3>
              {importedRecords.sleep.pap ? <p className="mt-2">PAP report window: {importedRecords.sleep.pap.startDate}–{importedRecords.sleep.pap.endDate}. Source-reported average AHI: {importedRecords.sleep.pap.averageAhi ?? "not supplied"} events/hour. This aggregate does not establish exact-night device use or treatment efficacy.</p> : null}
              <ul className="mt-2 space-y-2">
                {importedRecords.sleep.oxygen.map((recording, index) => (
                  <li key={`${recording.startDate}-${index}`}>
                    Oxygen recording {recording.startDate}–{recording.endDate}: mean SpO₂ {recording.meanSpo2 == null ? "not supplied" : `${recording.meanSpo2}%`}; minimum {recording.minimumSpo2 == null ? "not supplied" : `${recording.minimumSpo2}%`}; recorded time below 90% {recording.timeBelow90 ?? "not supplied"} (hours:minutes:seconds).
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {importedRecords.donationDates.length ? <p className="mt-3 text-xs leading-5 text-slate-600">Source-recorded donation dates: {importedRecords.donationDates.join(", ")}. A later donation is not evidence of a changed lab result.</p> : null}
          <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-slate-600">
            {[...importedRecords.evidenceLimits, ...importedRecords.sourceNotes].map((note, index) => <li key={index}>{note}</li>)}
          </ul>
        </details>
      ) : null}
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
          {importedRecords
            ? "Your imported source archive stays private. This view and coaching use bounded, dated summaries, not the full archive."
            : "Connected health and approved handoffs use bounded summaries, not raw records or workout routes."}
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
  if (source === "imported_records") return "bg-indigo-50 text-indigo-800";
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
