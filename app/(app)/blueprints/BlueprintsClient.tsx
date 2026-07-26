"use client";

import Link from "next/link";
import { FileDown, FileText } from "lucide-react";

type StackRow = {
  id: string;
  submission_id: string | null;
  tally_submission_id: string | null;
  created_at: string | null;
  safety_status: "safe" | "warning" | "error" | null;
  summary: string | null;
  sections: unknown;
};

export default function BlueprintsClient({ stack }: { stack: StackRow | null }) {
  const created = formatDate(stack?.created_at);
  const exportId = stack?.submission_id ?? stack?.tally_submission_id;
  const exportHref = exportId
    ? `/api/export-pdf?submission_id=${encodeURIComponent(exportId)}`
    : "/api/export-pdf";

  return (
    <div className="mx-auto min-h-[60vh] w-full max-w-4xl px-4 py-4 sm:px-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Blueprints</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#041B2D] sm:text-4xl">
          Your health Blueprint
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Review your latest personalized Blueprint and open the printable PDF whenever you need it.
        </p>
      </header>

      {!stack ? (
        <section className="mt-8 rounded-2xl border border-[#BCE3DA] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#041B2D]">Create your first Blueprint</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Complete the free intake to organize your goals, current stack, safety context, and most useful next steps.
          </p>
          <Link
            href="/quiz"
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white hover:bg-[#06695F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
          >
            Create my Blueprint
          </Link>
        </section>
      ) : (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#087F72]">Latest Blueprint</p>
              <h2 className="mt-1 text-2xl font-bold text-[#041B2D]">{created ?? "Date unavailable"}</h2>
            </div>
            <SafetyStatus status={stack.safety_status} />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/results?s=${encodeURIComponent(stack.id)}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white hover:bg-[#06695F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
            >
              <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
              View Blueprint
            </Link>
            <a
              href={exportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-5 py-3 font-bold text-[#041B2D] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
            >
              <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
              Open PDF
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

function SafetyStatus({ status }: { status: StackRow["safety_status"] }) {
  const label = status === "safe"
    ? "No material concern identified"
    : status === "warning"
      ? "Review safety notes"
      : status === "error"
        ? "Blueprint needs review"
        : "Safety status pending";
  const tone = status === "safe"
    ? "bg-emerald-50 text-emerald-800"
    : status === "warning"
      ? "bg-amber-50 text-amber-800"
      : "bg-slate-100 text-slate-700";
  return <span className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>{label}</span>;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
