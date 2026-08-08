"use client";

import Link from "next/link";
import { FileDown, FileText, History } from "lucide-react";

import { trackProductEvent } from "@/lib/productAnalyticsClient";
import type { PremiumActivationProgress } from "@/lib/premiumActivation";
import PremiumActivationChecklist from "@/components/activation/PremiumActivationChecklist";

type StackRow = {
  id: string;
  submission_id: string | null;
  tally_submission_id: string | null;
  created_at: string | null;
  safety_status: "safe" | "warning" | "error" | null;
  safety_acknowledged_at?: string | null;
  generation_reason?: string | null;
};

export default function BlueprintsClient({
  stacks,
  paid,
  activationProgress,
}: {
  stacks: StackRow[];
  paid: boolean;
  activationProgress: PremiumActivationProgress;
}) {
  const latest = stacks[0] ?? null;

  return (
    <div className="mx-auto min-h-[60vh] w-full max-w-5xl px-0 py-4 sm:px-2">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Blueprints</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#041B2D] sm:text-4xl">
          Your health Blueprints
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Review the plan built from your health context, keep your current supplement routine accurate,
          and refresh your guidance when something changes.
        </p>
      </header>

      {paid ? <div className="mt-8"><PremiumActivationChecklist progress={activationProgress} surface="blueprints" /></div> : null}

      {!latest ? (
        paid ? null : (
          <section className="mt-8 rounded-2xl border border-[#BCE3DA] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#041B2D]">Create your first Blueprint</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Complete the intake to organize your goals, current stack, safety context, and most useful next steps.
            </p>
            <Link
              href="/quiz"
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white hover:bg-[#06695F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
            >
              Create my Blueprint
            </Link>
          </section>
        )
      ) : (
        <>
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#087F72]">Latest Blueprint</p>
                <h2 className="mt-1 text-2xl font-bold text-[#041B2D]">
                  {formatDate(latest.created_at) ?? "Date unavailable"}
                </h2>
                {paid ? (
                  <p className="mt-2 text-sm text-slate-600">
                    Open your interactive workspace to review sections, update supplements, or refresh the report.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    Your free Blueprint remains available here. Premium adds ongoing updates and version history.
                  </p>
                )}
              </div>
              <SafetyStatus stack={latest} paid={paid} />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href={blueprintHref(latest, paid)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white hover:bg-[#06695F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
              >
                <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                {paid ? "Open Blueprint workspace" : "View Blueprint"}
              </Link>
              <a
                href={exportHref(latest)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackProductEvent({ event_name: "blueprint_pdf_opened", source: "blueprints" })}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-5 py-3 font-bold text-[#041B2D] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
              >
                <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
                Open PDF
              </a>
            </div>
          </section>

          {paid && stacks.length > 1 ? (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-[#087F72]" aria-hidden="true" />
                <h2 className="text-lg font-bold text-[#041B2D]">Previous versions</h2>
              </div>
              <ul className="mt-4 divide-y divide-slate-100">
                {stacks.slice(1).map((stack) => (
                  <li key={stack.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-[#041B2D]">{formatDate(stack.created_at) ?? "Date unavailable"}</p>
                      <p className="text-sm text-slate-500">{generationLabel(stack.generation_reason)}</p>
                    </div>
                    <Link
                      href={`/blueprints/${encodeURIComponent(stack.id)}`}
                      onClick={() => trackProductEvent({ event_name: "blueprint_version_selected", source: "blueprints" })}
                      className="text-sm font-bold text-[#087F72] hover:underline"
                    >
                      Open version
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function blueprintHref(stack: StackRow, paid: boolean): string {
  if (paid) return `/blueprints/${encodeURIComponent(stack.id)}`;
  const submissionId = stack.submission_id ?? stack.tally_submission_id;
  return submissionId
    ? `/results?submission_id=${encodeURIComponent(submissionId)}`
    : "/results";
}

function exportHref(stack: StackRow): string {
  return `/api/export-pdf?stack_id=${encodeURIComponent(stack.id)}`;
}

function generationLabel(reason: string | null | undefined): string {
  return reason === "member-refresh" ? "Updated after member changes" : "Original Blueprint";
}

function SafetyStatus({ stack, paid }: { stack: StackRow; paid: boolean }) {
  const status = stack.safety_status;
  const acknowledged = Boolean(stack.safety_acknowledged_at);
  const label = status === "safe"
    ? "No material concern identified"
    : acknowledged
      ? "Safety notes reviewed"
    : status === "warning"
      ? "Review safety notes"
      : status === "error"
        ? "Blueprint needs review"
        : "Safety status pending";
  const tone = status === "safe" || acknowledged
    ? "bg-emerald-50 text-emerald-800"
    : status === "warning"
      ? "bg-amber-50 text-amber-800"
      : "bg-slate-100 text-slate-700";
  if (paid && status !== "safe" && !acknowledged) {
    return <Link href={`/blueprints/${encodeURIComponent(stack.id)}#safety-notes`} className={`w-fit rounded-full px-3 py-1 text-sm font-semibold hover:underline ${tone}`}>{label}</Link>;
  }
  return <span className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>{label}</span>;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
