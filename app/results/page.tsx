// app/results/page.tsx
"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import CTAButton from "@/components/CTAButton";
import ReportSection from "@/components/ReportSection";
import { sectionsConfig } from "@/config/reportSections";
import { ChevronDown } from "lucide-react"; // nice lightweight icon

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

  // ... loadUserTier, fetchStack, regenerateStack, exportPDF remain unchanged ...

  // --- Accordion state ---
  const [openIds, setOpenIds] = useState<string[]>([]);
  const toggleOpen = (id: string) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // --- Fallback if no submission_id ---
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
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-[#041B2D] bg-gradient-to-r from-[#06C1A0] to-[#041B2D] bg-clip-text text-transparent">
          Your LVE360 Concierge Report
        </h1>
        <p className="text-gray-600 mt-2">Longevity • Vitality • Energy</p>
      </div>

      {/* Report body */}
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
                  {/* Header button */}
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
                    <ChevronDown
                      className={`w-5 h-5 text-gray-500 transform transition-transform duration-300 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {/* Collapsible content */}
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
                        {item.citations && (
                          <ul className="mt-2 list-disc ml-5">
                            {Array.isArray(item.citations) &&
                              item.citations.map((c: any, i: number) => (
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
                              ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <div className="mt-3 p-3 border rounded bg-gray-50 text-center">
                        <p className="text-gray-600 mb-2">
                          Rationale & Evidence available with Premium.
                        </p>
                        <CTAButton href="/pricing" variant="primary" size="sm">
                          Upgrade
                        </CTAButton>
                      </div>
                    )}

                    {/* Links */}
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
                </div>
              );
            })}
          </div>
        ) : markdown ? (
          <div className="prose prose-lg">{/* markdown fallback unchanged */}</div>
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
