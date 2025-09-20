// app/results/page.tsx
"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CTAButton from "@/components/CTAButton";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ResultsContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<any[] | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  // We now only use tally_submission_id from the URL
  const tallyId = searchParams?.get("tally_submission_id") ?? null;

  // --- Generate stack (free) ---
  async function generateStack() {
    if (!tallyId) {
      setError("Missing submission id. Please try again from the intake form.");
      return;
    }
    try {
      setGenerating(true);
      setError(null);

      const res = await fetch("/api/generate-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tally_submission_id: tallyId }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      if (data?.ok && data?.stack) {
        setItems(data.stack.items ?? null);
        setMarkdown(
          data.stack.sections?.markdown ??
            data.ai?.markdown ??
            data.stack.summary ??
            null
        );
      } else {
        setError(data?.error ?? "No stack returned");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // --- Export PDF ---
  async function exportPDF() {
    if (typeof window === "undefined") return;
    if (!reportRef.current) return;

    try {
      const mod = await import("html2pdf.js");
      const html2pdf = (mod as any).default || mod;

      html2pdf()
        .from(reportRef.current)
        .set({
          margin: 0.5,
          filename: "LVE360_Blueprint.pdf",
          html2canvas: { scale: 2 },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        })
        .save();
    } catch (err) {
      console.error("PDF export failed:", err);
      setError("PDF export failed. Please try again.");
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 animate-fadeIn font-sans">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold font-display text-[#041B2D]">
          Your LVE360 Blueprint
        </h1>
        <p className="text-gray-600 mt-2">
          Personalized insights for Longevity • Vitality • Energy
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-4 justify-center mb-8">
        <CTAButton
          onClick={generateStack}
          variant="primary"
          disabled={generating}
        >
          {generating ? "🤖 Generating..." : "✨ Generate Free Report"}
        </CTAButton>
        <CTAButton href="/pricing" variant="premium">
          👑 Upgrade to Premium
        </CTAButton>
      </div>

      {/* Messages */}
      {error && (
        <div className="text-center text-red-600 mb-6">
          ⚠️ {error}
        </div>
      )}

      {!markdown && !error && (
        <div className="text-center text-gray-600 mb-6">
          🤖 No report yet. Click{" "}
          <span className="font-semibold">Generate Free Report</span> above to
          get your Blueprint!
        </div>
      )}

      {/* Report body */}
      {markdown && (
        <div
          ref={reportRef}
          className="prose prose-lg max-w-none font-sans prose-h2:font-display prose-h2:text-2xl prose-h2:text-brand-dark prose-h3:font-display prose-h3:text-xl prose-h3:text-brand-dark prose-strong:text-brand-dark prose-a:text-brand hover:prose-a:underline prose-table:border prose-table:border-gray-200 prose-table:rounded-lg prose-table:shadow-sm prose-th:bg-brand-light prose-th:text-brand-dark prose-th:font-semibold prose-td:p-3 prose-th:p-3"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {markdown}
          </ReactMarkdown>
        </div>
      )}

      {/* Export button */}
      <div className="flex justify-center mt-10">
        <CTAButton onClick={exportPDF} variant="secondary">
          📄 Export as PDF
        </CTAButton>
      </div>

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t text-center text-sm text-gray-500">
        Longevity • Vitality • Energy —{" "}
        <span className="font-semibold">LVE360</span> © 2025
      </footer>
    </div>
  );
}

export default function ResultsPageWrapper() {
  return (
    <Suspense fallback={<p className="text-center py-8">Loading...</p>}>
      <ResultsContent />
    </Suspense>
  );
}
