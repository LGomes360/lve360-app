// app/results/page.tsx
"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CTAButton from "@/components/CTAButton";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ResultsContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [items, setItems] = useState<any[] | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);

  const [testMode] = useState(process.env.NODE_ENV !== "production");
  const searchParams = useSearchParams();
  const submissionId = searchParams?.get("submission_id") ?? null;

  // --- Load user tier (skip in test mode) ---
  async function loadUserTier() {
    if (testMode) return;
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

  // --- Fetch stack from API ---
  async function fetchStack(tier: "free" | "premium" = "free") {
    if (!submissionId) {
      setError("Missing submission_id in URL");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
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
          data.stack.sections?.markdown ?? data.ai?.markdown ?? data.summary ?? null
        );
        setError(null);
      } else {
        setError("No report found.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Export PDF ---
  async function exportPDF() {
    if (typeof window === "undefined") return; // 🚨 SSR guard
    if (!reportRef.current) return;

    try {
      const mod = await import("html2pdf.js");
      const html2pdf = (mod as any).default || mod; // ✅ fallback
      html2pdf()
        .from(reportRef.current)
        .set({
          margin: 0.5,
          filename: "LVE360_Report.pdf",
          html2canvas: { scale: 2 },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        })
        .save();
    } catch (err) {
      console.error("Failed to export PDF:", err);
      setError("PDF export failed");
    }
  }

  useEffect(() => {
    loadUserTier();
  }, [submissionId]);

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 animate-fadeIn">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold font-display text-[#041B2D] bg-gradient-to-r from-[#06C1A0] to-[#041B2D] bg-clip-text text-transparent">
          Your LVE360 Concierge Report
        </h1>
        <p className="text-gray-600 mt-2 font-sans">
          Personalized insights for Longevity • Vitality • Energy
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8 w-full max-w-md mx-auto">
        <CTAButton
          onClick={() => fetchStack("free")}
          variant="primary"
          fullWidth
          disabled={generating}
        >
          {generating ? "⏳ Generating..." : "✨ Generate Free Report"}
        </CTAButton>
        <CTAButton
          onClick={() =>
            isPremiumUser ? fetchStack("premium") : (window.location.href = "/pricing")
          }
          variant="premium"
          fullWidth
        >
          👑 Premium Report
        </CTAButton>
      </div>

      {loading && <p className="text-gray-500 text-center">🤖 Our AI is working hard to build your report...</p>}

      {error && (
        <div className="text-center text-red-600 mb-6">
          <p className="mb-2">⚠️ Something went wrong: {error}</p>
          <CTAButton onClick={() => fetchStack("free")} variant="secondary">
            Retry
          </CTAButton>
        </div>
      )}

      {/* Report body */}
      <div
        ref={reportRef}
        className="prose prose-lg max-w-none font-sans
        prose-h2:font-display prose-h2:text-2xl prose-h2:text-brand-dark
        prose-h3:font-display prose-h3:text-xl prose-h3:text-brand-dark
        prose-strong:text-brand-dark
        prose-a:text-brand hover:prose-a:underline
        prose-table:border prose-table:border-gray-200 prose-table:rounded-lg prose-table:shadow-sm
        prose-th:bg-brand-light prose-th:text-brand-dark prose-th:font-semibold prose-td:p-3 prose-th:p-3"
      >
        {markdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        ) : (
          <p className="text-gray-500 text-center">
            ⚠️ No report content available. Try generating.
          </p>
        )}
      </div>

      {/* Export button */}
      <div className="flex justify-center mt-8">
        <CTAButton onClick={exportPDF} variant="secondary">
          📄 Export as PDF
        </CTAButton>
      </div>

      {/* Footer */}
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
