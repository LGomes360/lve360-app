"use client";

import Link from "next/link";
import { useMemo } from "react";

type StackRow = {
  id: string;
  submission_id: string | null;
  tally_submission_id: string | null;
  created_at: string | null;
  safety_status: "safe" | "warning" | "error" | null;
  summary: string | null;
  sections: any | null;
};

export default function MyQuizClient({ stack }: { stack: StackRow | null }) {
  const created = useMemo(() => {
    if (!stack?.created_at) return null;
    try {
      const d = new Date(stack.created_at);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return null;
    }
  }, [stack?.created_at]);

  return (
    <main className="min-h-[60vh] max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-2">My Quiz</h1>
      <p className="text-gray-600 mb-8">
        View your most recent plan and export a PDF anytime.
      </p>

      {!stack ? (
        <div className="rounded-xl border border-purple-100 bg-purple-50 p-6">
          <p className="text-gray-700">
            We couldn’t find any results yet. Take the quiz to generate your personalized plan.
          </p>
          <div className="mt-4">
            <Link
              href="/quiz/premium"
              className="inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
            >
              Start Premium Quiz
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 p-6 space-y-4 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Latest result</div>
              <div className="text-lg font-semibold">
                {created ?? "Unknown date"}
              </div>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-sm ${
                stack.safety_status === "safe"
                  ? "bg-emerald-50 text-emerald-700"
                  : stack.safety_status === "warning"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-rose-50 text-rose-700"
              }`}
              title="Plan safety assessment"
            >
              {stack.safety_status ?? "—"}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/results"
              className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
            >
              View full report
            </Link>
            <a
              href={
                stack.submission_id
                  ? `/api/export-pdf?submission_id=${stack.submission_id}`
                  : stack.tally_submission_id
                  ? `/api/export-pdf?submission_id=${stack.tally_submission_id}`
                  : `/api/export-pdf`
              }
              className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-gray-800 hover:bg-gray-50"
            >
              Export PDF
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
