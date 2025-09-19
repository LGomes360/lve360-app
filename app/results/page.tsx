// -----------------------------------------------------------------------------
// File: app/results/page.tsx
// LVE360 // Results Page
// Fetches saved stack from /api/get-stack and displays structured items
// with premium gating. Adds regenerate + export-to-PDF.
// -----------------------------------------------------------------------------

"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import CTAButton from "@/components/CTAButton";
import ReportSection from "@/components/ReportSection";
import { sectionsConfig } from "@/config/reportSections";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ResultsContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

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
  async function fetchStack() {
    if (!submissionId) {
      setError("Missing submission_id in URL");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(
        `/api/get-stack?submission_id=${encodeURIComponent(submissionId)}`
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      if (data?.ok && data?.stack) {
        const stack = data.stack;
        setItems(stack.items ?? null);
        setMarkdown(
          stack.sections?.markdown ??
            stack.ai?.markdown ??
            stack.summary ??
            null
        );
        setError(null);
      } else {
        setError(data?.error ?? "No stack found");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Regenerate stack on demand ---
  async function regenerateStack() {
    if (!submissionId) return;
    try {
      setRegenerating(true);
      const res = await fetch("/api/generate-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (data?.ok && data?.stack) {
        setItems(data.stack.items ?? null);
        setMarkdown(
          data.stack.sections?.markdown ?? data.ai?.markdown ?? null
        );
        setError(null);
      } else {
        setError("Regenerate failed.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  }

  // --- Export PDF (dynamic import ensures browser-only) ---
  async function exportPDF() {
    if (typeof window === "undefined") return; // 🚨 guard for SSR
    if (!reportRef.current) return;

    try {
      const html2pdf = await import("html2pdf.js");
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
    fetchStack();
  }, [submissionId]);

  // --- Split fallback markdown into sections ---
  function splitSections(md: string): Record<string, string> {
    const parts = md.split(/^## /gm);
    const sections: Record<string, string> = {};
    for (const part of parts ?? []) {
      if (!part.trim()) continue;
      const [header, ...rest] = part.split("\n");
      sections[header.trim()] = rest.join("\n").trim();
    }
    return sections;
  }

  const sections: Record<string, string> = markdown ? splitSections(markdown) : {};

  // --- Fallback if no submission_id ---
  if (!submissionId) {
    return (
      <div className="max-w-xl mx-auto py-12 px-6 text-center">
        <h1 className="text-2xl font-semibold mb-4 text-[#041B2D]">
          No Report Found
        </h1>
        <p className="text-gray-600 mb-6">
          It looks like you landed here without completing the intake quiz.
          Please start with the quiz to generate your personalized report.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <CTAButton href="https://tally.so/r/mOqRBk" variant="primary">
            Take the Quiz
          </CTAButton>
          <CTAButton href="/" variant="secondary">
            Back to Home
          </CTAButton>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      {/* Header with gradient */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-[#041B2D] bg-gradient-to-r from-[#06C1A0] to-[#041B2D] bg-clip-text text-transparent">
          Your LVE360 Concierge Report
        </h1>
        <p className="text-gray-600 mt-2">
          Personalized insights for Longevity • Vitality • Energy
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-center mb-8">
        {testMode && (
          <CTAButton
            onClick={() => setIsPremiumUser((prev) => !prev)}
            variant="secondary"
          >
            Toggle Premium Mode ({isPremiumUser ? "Premium" : "Free"})
          </CTAButton>
        )}
        <CTAButton
          onClick={regenerateStack}
          variant="primary"
          disabled={regenerating}
        >
          {regenerating ? "⏳ Refreshing..." : "🔄 Refresh Report"}
        </CTAButton>
        <CTAButton onClick={exportPDF} variant="secondary">
          📄 Export PDF
        </CTAButton>
      </div>

      {loading && <p className="text-gray-500 text-center">Loading your report...</p>}
      {error && <p className="text-red-600 text-center">❌ {error}</p>}

      {/* Report body */}
      <div ref={reportRef} className="space-y-6">
        {items && items.length > 0 ? (
          <div className="grid gap-6">
            {items.map((item, idx) => (
              <ReportSection
                key={idx}
                header={item.section ?? `Section ${idx + 1}`}
                body={item.text}
                premiumOnly={false}
                isPremiumUser={isPremiumUser}
              />
            ))}
          </div>
        ) : markdown ? (
          <div className="prose prose-lg space-y-6">
            {sectionsConfig.map(({ header, premiumOnly }) => {
              if (!sections[header]) return null;

              if (premiumOnly && !isPremiumUser) {
                return (
                  <div
                    key={header}
                    className="border border-gray-200 rounded-xl p-6 bg-gray-50 text-center shadow-sm"
                  >
                    <h2 className="text-xl font-semibold mb-2 text-[#041B2D]">
                      {header}
                    </h2>
                    <p className="text-gray-600 mb-4">
                      This section is available with Premium.
                    </p>
                    <CTAButton href="/pricing" variant="primary">
                      Upgrade to Premium
                    </CTAButton>
                  </div>
                );
              }

              return (
                <ReportSection
                  key={header}
                  header={header}
                  body={sections[header]}
                  premiumOnly={premiumOnly}
                  isPremiumUser={isPremiumUser}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-center">
            ⚠️ No report content available. Try regenerating.
          </p>
        )}
      </div>
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
