"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CTAButton from "@/components/CTAButton";

/* ----------------------------- helpers ----------------------------- */

/** Remove code fences added by models/tools */
function sanitizeMarkdown(md: string): string {
  if (!md) return md;
  let out = md.replace(/^```[a-z]*\n/i, "").replace(/```$/, "");
  return out.trim();
}

/** Normalize whitespace so header detection is reliable across PDFs/LLM quirks */
function normalize(md: string): string {
  return (md || "")
    .replace(/\r\n?/g, "\n")                 // CRLF/CR -> LF
    .replace(/[\u00A0\u2000-\u200B]/g, " ")  // NBSP & thin spaces -> space
    .replace(/[ \t]+\n/g, "\n");             // strip trailing spaces before newline
}

/** Robust section extractor:
 *  1) Build an index of all level-2 headings
 *  2) Find the requested heading by normalized text
 *  3) Slice from its start to the next heading start
 */
function extractSection(md: string, headingVariants: string[]): string | null {
  if (!md) return null;
  const text = normalize(md);

  // Index all H2 headings
  const headingRe = /^##\s+([^\n]+?)\s*$/gmi;
  const hits: Array<{ name: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text)) !== null) {
    hits.push({ name: m[1].trim(), index: m.index });
  }
  if (hits.length === 0) return null;

  const wanted = headingVariants.map((v) => v.toLowerCase().replace(/\s+/g, " "));
  const foundIdx = hits.findIndex((h) =>
    wanted.includes(h.name.toLowerCase().replace(/\s+/g, " "))
  );
  if (foundIdx === -1) return null;

  const start = hits[foundIdx].index;
  const end = foundIdx < hits.length - 1 ? hits[foundIdx + 1].index : text.length;

  // Remove the heading line itself
  const body = text.slice(start, end).replace(/^##\s+[^\n]+\n?/, "");
  return body.trim();
}

function Prose({ children }: { children: string }) {
  return (
    <div className="prose prose-gray max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

/* --------------------------- UI primitives ------------------------- */

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-[#06C1A0] mb-4">{title}</h2>
      {children}
    </div>
  );
}

/* ------------------------------ page ------------------------------- */

function ResultsContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const searchParams = useSearchParams();
  const tallyId = searchParams?.get("tally_submission_id") ?? null;

  async function fetchStack() {
    if (!tallyId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/get-stack?submission_id=${encodeURIComponent(tallyId)}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (data?.ok && data?.stack) {
        const raw = data.stack.sections?.markdown ?? data.stack.summary ?? "";
        setMarkdown(normalize(sanitizeMarkdown(raw)));
      }
    } catch (err: any) {
      console.warn("No existing stack found:", err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }

  async function generateStack() {
    if (!tallyId) {
      setError("Missing submission ID. Please try again from the intake form.");
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
        const raw =
          data.stack.sections?.markdown ??
          data.ai?.markdown ??
          data.stack.summary ??
          "";
        setMarkdown(normalize(sanitizeMarkdown(raw)));
      } else {
        setError(data?.error ?? "No stack returned");
      }
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  async function exportPDF() {
    if (!tallyId) {
      setError("Missing submission ID. Please refresh and try again.");
      return;
    }
    try {
      setError(null);
      const res = await fetch(`/api/export-pdf?submission_id=${tallyId}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || `PDF export failed (status ${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => window.URL.revokeObjectURL(url), 5000);
    } catch (err: any) {
      console.error("PDF export failed:", err);
      setError("🚨 PDF export failed. Please try again, or contact support if it persists.");
    }
  }

  useEffect(() => {
    fetchStack();
  }, [tallyId]);

  const sections = useMemo(() => {
    const md = markdown ?? "";
    return {
      summary: extractSection(md, ["Summary"]),
      goals: extractSection(md, ["Goals"]),
      contra: extractSection(md, [
        "Contraindications & Med Interactions",
        "Contraindications",
      ]),
      current: extractSection(md, ["Current Stack", "Current Supplements"]),
      // Strict to the enforced LLM header
      blueprintRecs: extractSection(md, ["Your Blueprint Recommendations"]),
      recommended: extractSection(md, ["Recommended Stack"]),
      dosing: extractSection(md, ["Dosing & Notes", "Notes"]),
      evidence: extractSection(md, ["Evidence & References"]),
      shopping: extractSection(md, ["Shopping Links"]),
      follow: extractSection(md, ["Follow-up Plan"]),
      lifestyle: extractSection(md, ["Lifestyle Prescriptions"]),
      longevity: extractSection(md, ["Longevity Levers"]),
      try: extractSection(md, ["This Week Try", "Weekly Experiment"]),
    };
  }, [markdown]);

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 font-sans">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold font-display text-[#041B2D]">
          Your LVE360 Blueprint
        </h1>
        <p className="text-gray-600 mt-2">
          Personalized insights for Longevity • Vitality • Energy
        </p>
      </div>

      {/* Actions */}
      <SectionCard title="Actions">
        <div className="flex flex-wrap gap-4 justify-center">
          <CTAButton onClick={generateStack} variant="gradient" disabled={generating}>
            {generating ? "🤖 Generating..." : "✨ Generate Free Report"}
          </CTAButton>
          <CTAButton href="/pricing" variant="premium">
            👑 Upgrade to Premium
          </CTAButton>
        </div>
      </SectionCard>

      {/* Messages */}
      {error && <div className="text-center text-red-600 mb-6">{error}</div>}
      {!markdown && !error && !loading && (
        <div className="text-center text-gray-600 mb-6">
          🤖 Your Blueprint isn’t ready yet. Click{" "}
          <span className="font-semibold">Generate Free Report</span> to let our AI get to work!
        </div>
      )}

      {/* Report sections */}
      {markdown && (
        <div>
          {sections.summary && (
            <SectionCard title="Summary">
              <Prose>{sections.summary}</Prose>
            </SectionCard>
          )}

          {sections.goals && (
            <SectionCard title="Goals">
              <Prose>{sections.goals}</Prose>
            </SectionCard>
          )}

          {sections.contra && (
            <SectionCard title="Contraindications & Med Interactions">
              <Prose>{sections.contra}</Prose>
            </SectionCard>
          )}

          {sections.current && (
            <SectionCard title="Current Stack">
              <Prose>{sections.current}</Prose>
            </SectionCard>
          )}

          <SectionCard title="Your Blueprint Recommendations">
            {sections.blueprintRecs ? (
              <Prose>{sections.blueprintRecs}</Prose>
            ) : (
              <p className="text-gray-500">
                No Blueprint Recommendations were generated.
              </p>
            )}
          </SectionCard>

          {sections.recommended && (
            <SectionCard title="Recommended Stack">
              <Prose>{sections.recommended}</Prose>
            </SectionCard>
          )}

          {sections.dosing && (
            <SectionCard title="Dosing & Notes">
              <Prose>{sections.dosing}</Prose>
            </SectionCard>
          )}

          {sections.evidence && (
            <SectionCard title="Evidence & References">
              <Prose>{sections.evidence}</Prose>
            </SectionCard>
          )}

          {sections.shopping && (
            <SectionCard title="Shopping Links">
              <Prose>{sections.shopping}</Prose>
            </SectionCard>
          )}

          {sections.follow && (
            <SectionCard title="Follow-up Plan">
              <Prose>{sections.follow}</Prose>
            </SectionCard>
          )}

          {sections.lifestyle && (
            <SectionCard title="Lifestyle Prescriptions">
              <Prose>{sections.lifestyle}</Prose>
            </SectionCard>
          )}

          {sections.longevity && (
            <SectionCard title="Longevity Levers">
              <Prose>{sections.longevity}</Prose>
            </SectionCard>
          )}

          {sections.try && (
            <SectionCard title="This Week Try">
              <Prose>{sections.try}</Prose>
            </SectionCard>
          )}

          {/* Export PDF at bottom */}
          <div className="flex justify-center mt-8">
            <div className="relative group">
              <button
                onClick={exportPDF}
                aria-label="Export PDF"
                className="w-10 h-10 flex items-center justify-center rounded-md border border-gray-300 bg-white shadow-sm hover:shadow-md transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="w-6 h-6 transition-transform transform hover:scale-110"
                >
                  <rect
                    x="2"
                    y="2"
                    width="20"
                    height="20"
                    rx="2"
                    ry="2"
                    fill="white"
                    stroke="#041B2D"
                    strokeWidth="1.5"
                  />
                  <rect
                    x="6"
                    y="14"
                    width="12"
                    height="6"
                    rx="2"
                    fill="#E63946"
                    className="transition-colors group-hover:fill-red-600"
                  />
                  <text
                    x="12"
                    y="18"
                    textAnchor="middle"
                    fontSize="7"
                    fontWeight="bold"
                    fill="white"
                  >
                    PDF
                  </text>
                  <path
                    d="M12 6v5m0 0l-2-2m2 2l2-2"
                    stroke="#06C1A0"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-colors group-hover:stroke-emerald-500"
                  />
                </svg>
              </button>
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-md transition-opacity">
                Export PDF
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t text-center text-sm text-gray-500">
        Longevity • Vitality • Energy — <span className="font-semibold">LVE360</span> © 2025
        <div className="mt-2 space-x-4">
          <a href="/terms" className="hover:underline">Terms</a>
          <a href="/privacy" className="hover:underline">Privacy</a>
          <a href="/contact" className="hover:underline">Contact</a>
        </div>
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
