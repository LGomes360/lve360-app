// -----------------------------------------------------------------------------
// File: app/results/page.tsx
// LVE360 Results Page (Blueprint version)
// -----------------------------------------------------------------------------

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
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [items, setItems] = useState<any[] | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const submissionId = searchParams?.get("submission_id") ?? searchParams?.get("tally_submission_id") ?? null;

  // --- Load user tier (skip in test mode) ---
  async function loadUserTier() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const { data: userRow } = await supabase
        .from("users")
        .select("tier")
        .eq("id", session.user.id)
        .maybeSingle();
      setIsPremiumUser(userRow?.tier === "premium");
    }
  }

  // --- Fetch stack from API ---
  async function fetchStack() {
    if (!submissionId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/get-stack?submission_id=${encodeURIComponent(submissionId)}`
      );
      const data = await res.json();

      if (res.ok && data?.ok && data?.stack) {
        const stack = data.stack;
        setItems(stack.items ?? null);
        setMarkdown(
          stack.sections?.markdown ?? stack.ai?.markdown ?? stack.summary ?? null
        );
      } else {
        setError(data?.error ?? "No stack found");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Regenerate stack (free or premium) ---
  async function regenerateStack(mode: "free" | "premium") {
    if (!submissionId) {
      setError("Missing submission_id in URL");
      return;
    }

    if (mode === "premium" && !isPremiumUser) {
      router.push("/pricing");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/generate-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submissionId,
          tally_submission_id: submissionId,
          mode,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.ok && data?.stack) {
        setItems(data.stack.items ?? null);
        setMarkdown(
          data.stack.sections?.markdown ?? data.ai?.markdown ?? null
        );
      } else {
        setError("Report generation failed. Please try again.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
      console.error("Failed to export PDF:", err);
      setError("PDF export failed");
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
      <div className="flex flex-wrap gap-4 justify-center mb-8">
        <CTAButton
          onClick={() => regenerateStack("free")}
          variant="primary"
          fullWidth={false}
        >
          ✨ Generate Free Report
        </CTAButton>
        <CTAButton
          onClick={() => regenerateStack("premium")}
          variant="premium"
          fullWidth={false}
        >
          👑 Upgrade to Premium
        </CTAButton>
      </div>

      {/* Loading/Error */}
      {loading && (
        <p className="text-center text-gray-600 mb-4">
          🤖 Our AI is working hard to build your Blueprint...
        </p>
      )}

      {error && !loading && (
        <div className="text-center text-red-600 mb-6">
          <p className="mb-2">⚠️ {error}</p>
          <CTAButton onClick={fetchStack} variant="secondary">
            Retry
          </CTAButton>
        </div>
      )}

      {/* Report content */}
      <div
        ref={reportRef}
        className="prose prose-lg max-w-none font-sans mb-8
          prose-h2:font-display prose-h2:text-2xl prose-h2:text-brand-dark
          prose-h3:font-display prose-h3:text-xl prose-h3:text-brand-dark
          prose-strong:text-brand-dark prose-a:text-brand hover:prose-a:underline
          prose-table:border prose-table:border-gray-200 prose-table:rounded-lg prose-table:shadow-sm
          prose-th:bg-brand-light prose-th:text-brand-dark prose-th:font-semibold prose-td:p-3 prose-th:p-3"
      >
        {markdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        ) : (
          !loading && (
            <p className="text-gray-500 text-center">
              ⚠️ No report content yet. Try generating above.
            </p>
          )
        )}
      </div>

      {/* Export PDF at bottom */}
      <div className="flex justify-center">
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
    <Suspense fallback={<p className="text-center py-8">Loading Blueprint...</p>}>
      <ResultsContent />
    </Suspense>
  );
}
