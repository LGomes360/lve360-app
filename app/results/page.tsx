// app/results/page.tsx
"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CTAButton from "@/components/CTAButton";
import generateStackForSubmission from "@/lib/generateStack"; // ✅ fixed import

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ResultsContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [items, setItems] = useState<any[] | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();
  const submissionId = searchParams?.get("submission_id") ?? null;

  // --- Load user tier (skip in dev mode) ---
  async function loadUserTier() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const { data: userRow } = await supabase
        .from("users")
        .select("tier")
        .eq("id", session.user.id)
        .single();
      setIsPremiumUser(userRow?.tier === "premium");
    }
  }

  // --- Fetch existing stack ---
  async function fetchStack() {
    if (!submissionId) return;
    try {
      setLoading(true);
      const res = await fetch(
        `/api/get-stack?submission_id=${encodeURIComponent(submissionId)}`
      );
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
        setError(null);
      } else {
        setError("No report found yet. Click a button to generate.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Generate stack on demand ---
  async function generateStack(tier: "free" | "premium") {
    if (!submissionId) return;
    try {
      setGenerating(true);
      const res = await fetch("/api/generate-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submissionId,
          tally_submission_id: submissionId,
          tier,
        }),
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
        setError(null);
      } else {
        setError("Report generation failed. Try again.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // --- Export PDF (browser-only) ---
  async function exportPDF() {
    if (typeof window === "undefined") return;
    if (!reportRef.current) return;

    try {
      const mod = await import("html2pdf.js/dist/html2pdf.bundle.min.js");
      const html2pdf = (mod as any).default || (window as any).html2pdf;
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

  useEffect(() => {
    loadUserTier();
    fetchStack();
  }, [submissionId]);

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 animate-fadeIn">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold font-display text-[#041B2D] bg-gradient-to-r from-[#06C1A0] to-[#041B2D] bg-clip-text text-transparent">
          Your LVE360 Blueprint
        </h1>
        <p className="text-gray-600 mt-2 font-sans">
          Personalized insights for Longevity • Vitality • Energy
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-center mb-8">
        <CTAButton
          onClick={() => generateStack("free")}
          variant="primary"
          disabled={generating}
        >
          {generating ? "🤖 Generating..." : "📝 Generate Free Report"}
        </CTAButton>
        <CTAButton
          onClick={() =>
            isPremiumUser ? generateStack("premium") : (window.location.href = "/pricing")
          }
          variant="premium"
        >
          👑 Upgrade to Premium
        </CTAButton>
      </div>

      {/* Loading / error states */}
      {loading && <p className="text-gray-500 text-center">Loading your report...</p>}

      {error && (
        <div className="text-center text-gray-600 mb-6">
          <p className="mb-2">{error}</p>
        </div>
      )}

      {/* Report body */}
      <div
        ref={reportRef}
        className="prose prose-lg max-w-none font-sans
          prose-h2:font-display prose-h2:text-2xl prose-h2:text-brand-dark
          prose-h3:font-display prose-h3:text-xl prose-h3:text-brand-dark
          prose-strong:text-brand-dark prose-a:text-brand hover:prose-a:underline
          prose-table:border prose-table:border-gray-200 prose-table:rounded-lg prose-table:shadow-sm
          prose-th:bg-brand-light prose-th:text-brand-dark prose-th:font-semibold prose-td:p-3 prose-th:p-3"
      >
        {markdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        ) : (
          <p className="text-gray-500 text-center">
            No report content available yet. Click "Generate Free Report" above.
          </p>
        )}
      </div>

      {/* Footer with export */}
      <div className="flex justify-center mt-10">
        <CTAButton onClick={exportPDF} variant="secondary">
          📄 Export to PDF
        </CTAButton>
      </div>

      <footer className="mt-12 pt-6 border-t text-center text-sm text-gray-500">
        Longevity • Vitality • Energy — <span className="font-semibold">LVE360</span> © 2025
      </footer>
    </div>
  );
}

export default function ResultsPageWrapper() {
  return (
    <Suspense fallback={<p className="text-center py-8">Loading report...</p>}>
      <ResultsContent />
    </Suspense>
  );
}
