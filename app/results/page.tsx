// -----------------------------------------------------------------------------
// File: app/results/page.tsx
// LVE360 // Results Page
// Shows stack + child items with expandable supplement cards.
// Premium users see rationale/evidence; free users see gating CTA.
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

interface StackItem {
  id: string;
  name: string;
  brand?: string;
  dose?: string;
  timing?: string;
  notes?: string;
  rationale?: string;
  caution?: string;
  citations?: any;
  link_amazon?: string;
  link_thorne?: string;
  link_fullscript?: string;
  link_other?: string;
  is_custom?: boolean;
}

function ResultsContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [items, setItems] = useState<StackItem[]>([]);
  const [markdown, setMarkdown] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);
  const [testMode] = useState(process.env.NODE_ENV !== "production");
  const searchParams = useSearchParams();
  const submissionId = searchParams?.get("submission_id") ?? null;

  // --- Load user tier ---
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

  // --- Fetch stack ---
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
        setItems(stack.items ?? []);
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

  // --- Regenerate stack ---
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
        setItems(data.stack.items ?? []);
        setMarkdown(data.stack.sections?.markdown ?? data.ai?.markdown ?? null);
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

  // --- Export PDF ---
  async function exportPDF() {
    if (typeof window === "undefined") return;
    if (!reportRef.current) return;
    try {
      const html2pdfModule = await import("html2pdf.js");
      html2pdfModule
        .default()
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

  // --- Split fallback markdown ---
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
      <div className="max-w-xl mx-auto py-12 px-6 text-center animate-fadeIn">
        <h1 className="text-2xl font-semibold mb-4 text-[#041B2D]">
          No Report Found
        </h1>
        <p className="text-gray-600 mb-6">
          It looks like you landed here without completing the intake quiz.
        </p>
        <CTAButton href="https://tally.so/r/mOqRBk" variant="primary">
          Take the Quiz
        </CTAButton>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 animate-fadeIn">
      {/* Header */}
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
      {error && <p className="text-center text-red-600 mb-6">⚠️ {error}</p>}

      <div ref={reportRef} className="space-y-6">
        {/* Supplement items */}
        {items && items.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <details
                key={item.id}
                className="border rounded-lg shadow-sm p-4 bg-white hover:shadow-md transition group"
              >
                <summary className="cursor-pointer font-semibold text-lg text-[#041B2D]">
                  {item.name} {item.dose ? `– ${item.dose}` : ""}
                  {item.timing && (
                    <span className="ml-2 text-sm text-gray-500">
                      ({item.timing})
                    </span>
                  )}
                </summary>
                <div className="mt-2 space-y-2 text-sm text-gray-700">
                  {item.brand && <p>Brand: {item.brand}</p>}
                  {item.notes && <p>{item.notes}</p>}

                  {/* Premium gating */}
                  {isPremiumUser ? (
                    <>
                      {item.rationale && (
                        <p>
                          <strong>Rationale:</strong> {item.rationale}
                        </p>
                      )}
                      {item.caution && (
                        <p className="text-red-600">
                          <strong>Caution:</strong> {item.caution}
                        </p>
                      )}
                      {item.citations && (
                        <ul className="list-disc ml-5">
                          {Array.isArray(item.citations)
                            ? item.citations.map((c: any, i: number) => (
                                <li key={i}>
                                  <a
                                    href={c.url ?? c}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#06C1A0] underline"
                                  >
                                    {c.label ?? c.url ?? c}
                                  </a>
                                </li>
                              ))
                            : null}
                        </ul>
                      )}
                    </>
                  ) : (
                    <div className="mt-2 p-3 border rounded bg-gray-50 text-center">
                      <p className="text-gray-600 mb-2">
                        Rationale & Evidence available with Premium.
                      </p>
                      <CTAButton href="/pricing" variant="primary" size="sm">
                        Upgrade
                      </CTAButton>
                    </div>
                  )}

                  {/* Shopping links */}
                  {item.link_amazon && (
                    <a
                      href={item.link_amazon}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#06C1A0] text-sm underline block"
                    >
                      Buy on Amazon
                    </a>
                  )}
                  {item.link_fullscript && (
                    <a
                      href={item.link_fullscript}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#06C1A0] text-sm underline block"
                    >
                      Buy on Fullscript
                    </a>
                  )}
                </div>
              </details>
            ))}
          </div>
        ) : markdown ? (
          // Fallback to markdown sections
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
                    <p className="text-gray-600 mb-4">This section is Premium only.</p>
                    <CTAButton href="/pricing" variant="primary">
                      Upgrade
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
          <p className="text-gray-500 text-center">⚠️ No report content available.</p>
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
