"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import CTAButton from "@/components/CTAButton";
import ReportSection from "@/components/ReportSection";
import { sectionsConfig } from "@/config/reportSections";
import { ChevronDown } from "lucide-react";

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
  link_fullscript?: string;
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

  const [openIds, setOpenIds] = useState<string[]>([]);
  const toggleOpen = (id: string) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

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

  if (!submissionId) {
    return (
      <div className="max-w-xl mx-auto py-12 px-6 text-center animate-fadeIn">
        <h1 className="text-2xl font-semibold mb-4 text-[#041B2D]">No Report Found</h1>
        <CTAButton href="https://tally.so/r/mOqRBk" variant="primary">
          Take the Quiz
        </CTAButton>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 animate-fadeIn">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-[#041B2D] bg-gradient-to-r from-[#06C1A0] to-[#041B2D] bg-clip-text text-transparent">
          Your LVE360 Concierge Report
        </h1>
        <p className="text-gray-600 mt-2">Longevity • Vitality • Energy</p>
      </div>

      <div ref={reportRef} className="space-y-6">
        {items && items.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => {
              const isOpen = openIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  className="border rounded-lg shadow-sm bg-white overflow-hidden"
                >
                  <button
                    onClick={() => toggleOpen(item.id)}
                    className="w-full flex items-center justify-between p-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <div>
                      <h3 className="font-semibold text-lg text-[#041B2D]">
                        {item.name} {item.dose ? `– ${item.dose}` : ""}
                      </h3>
                      {item.timing && (
                        <p className="text-sm text-gray-500">Timing: {item.timing}</p>
                      )}
                    </div>
                  </button>

                  <div
                    className={`transition-all duration-500 ease-in-out ${
                      isOpen ? "max-h-screen p-4" : "max-h-0"
                    } overflow-hidden`}
                  >
                    {item.brand && <p className="text-sm">Brand: {item.brand}</p>}
                    {item.notes && <p className="mt-2 text-gray-700">{item.notes}</p>}

                    {isPremiumUser ? (
                      <>
                        {item.rationale && (
                          <p className="mt-2">
                            <strong>Rationale:</strong> {item.rationale}
                          </p>
                        )}
                        {item.caution && (
                          <p className="mt-2 text-red-600">
                            <strong>Caution:</strong> {item.caution}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="mt-3 p-3 border rounded bg-gray-50 text-center">
                        <p className="text-gray-600 mb-2">
                          Rationale & Evidence available with Premium.
                        </p>
                        <CTAButton href="/pricing" variant="primary">
                          Upgrade
                        </CTAButton>
                      </div>
                    )}

                    {item.link_amazon && (
                      <a
                        href={item.link_amazon}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 text-[#06C1A0] text-sm underline block"
                      >
                        Buy on Amazon
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : markdown ? (
          <div className="prose prose-lg">
            {/* Markdown fallback unchanged */}
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
