"use client";

import { useMemo } from "react";
import Link from "next/link";

type Props = {
  stack: {
    id: string;
    submission_id: string | null;
    tally_submission_id: string | null;
    created_at: string | null;
    safety_status: "safe" | "warning" | "error" | null;
    summary: string | null;
    sections: { markdown?: string } | null;
  } | null;
};

export default function MyQuizClient({ stack }: Props) {
  const created = stack?.created_at
    ? new Date(stack.created_at).toLocaleDateString()
    : null;

  const statusColor = {
    safe: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    error: "bg-rose-100 text-rose-700",
  }[stack?.safety_status ?? "safe"] ?? "bg-gray-100 text-gray-700";

  // Tiny preview (first few lines)
  const preview = useMemo(() => {
    const md = stack?.sections?.markdown ?? stack?.summary ?? "";
    return md.trim().slice(0, 400) + (md.length > 400 ? "…" : "");
  }, [stack]);

  // Link target for your full report (adjust if you have a premium route)
  const fullReportHref = "/results" + (stack ? `?s=${stack.id}` : "");

  // Export PDF link: prefer submission_id, fall back to tally id, else stack id.
  const exportId =
    stack?.submission_id ??
    stack?.tally_submission_id ??
    stack?.id;

  const exportHref = exportId
    ? `/api/export-pdf?submission_id=${encodeURIComponent(exportId)}`
    : undefined;

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB]">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-extrabold">
          My Quiz Results
        </h1>

        {!stack ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-gray-700 mb-4">
              You don’t have results yet. Take the quick intake to generate your personalized plan.
            </p>
            <div className="flex gap-3">
              <Link
                href="/quiz"
                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700"
              >
                Start the Quiz
              </Link>
              <Link
                href="/quiz/premium"
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Try Premium Quiz
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-semibold">Latest plan</span>
              {created && <span className="text-gray-500">• {created}</span>}
              {stack.safety_status && (
                <span className={`text-xs px-2.5 py-1 rounded-full ${statusColor}`}>
                  Safety: {stack.safety_status}
                </span>
              )}
            </div>

            {preview && (
              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {preview}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href={fullReportHref}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              >
                View full report
              </Link>

              {exportHref && (
                <a
                  href={exportHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Export PDF
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
