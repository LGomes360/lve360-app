"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CTAButton from "@/components/CTAButton";

/* ----------------------------- helpers ----------------------------- */

function sanitizeMarkdown(md: string): string {
  if (!md) return md;
  let out = md.replace(/^```[a-z]*\n/i, "").replace(/```$/, "");
  return out.trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(md: string, headingVariants: string[]): string | null {
  if (!md) return null;
  let startIdx = -1;

  for (const h of headingVariants) {
    const re = new RegExp(`^##\\s*${escapeRegExp(h)}\\b.*`, "mi");
    const m = re.exec(md);
    if (m && (startIdx === -1 || (m.index ?? -1) < startIdx)) {
      startIdx = m.index;
    }
  }

  if (startIdx === -1) return null;

  const tail = md.slice(startIdx + 1);
  const next = /\n##\s+/m.exec(tail);
  const endIdx = next ? startIdx + 1 + next.index : md.length;
  let slice = md.slice(startIdx, endIdx);

  slice = slice.replace(/^##\s*[^\n]+\n?/, "");

  return slice.trim();
}

function Prose({ children }: { children: string }) {
  return (
    <div className="prose prose-gray max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

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
        setMarkdown(sanitizeMarkdown(raw));
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
        setMarkdown(sanitizeMarkdown(raw));
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
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold font-display text-[#041B2D]">
          Your LVE360 Blueprint
        </h1>
        <p className="text-gray-600 mt-2">
          Personalized insights for Longevity • Vitality • Energy
        </p>
      </div>

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

      {error && <div className="text-center text-red-600 mb-6">{error}</div>}
      {!markdown && !error && !loading && (
        <div className="text-center text-gray-600 mb-6">
          🤖 Your Blueprint isn’t ready yet. Click{" "}
          <span className="font-semibold">Generate Free Report</span> to let our AI get to work!
        </div>
      )}

      {markdown && (
        <div>
          {sections.summary && <SectionCard title="Summary"><Prose>{sections.summary}</Prose></SectionCard>}
          {sections.goals && <SectionCard title="Goals"><Prose>{sections.goals}</Prose></SectionCard>}
          {sections.contra && <SectionCard title="Contraindications & Med Interactions"><Prose>{sections.contra}</Prose></SectionCard>}
          {sections.current && <SectionCard title="Current Stack"><Prose>{sections.current}</Prose></SectionCard>}
          <SectionCard title="Your Blueprint Recommendations">
            {sections.blueprintRecs ? (
              <Prose>{sections.blueprintRecs}</Prose>
            ) : (
              <p className="text-gray-500">No Blueprint Recommendations were generated.</p>
            )}
          </SectionCard>
          {sections.recommended && <SectionCard title="Recommended Stack"><Prose>{sections.recommended}</Prose></SectionCard>}
          {sections.dosing && <SectionCard title="Dosing & Notes"><Prose>{sections.dosing}</Prose></SectionCard>}
          {sections.evidence && <SectionCard title="Evidence & References"><Prose>{sections.evidence}</Prose></SectionCard>}
          {sections.shopping && <SectionCard title="Shopping Links"><Prose>{sections.shopping}</Prose></SectionCard>}
          {sections.follow && <SectionCard title="Follow-up Plan"><Prose>{sections.follow}</Prose></SectionCard>}
          {sections.lifestyle && <SectionCard title="Lifestyle Prescriptions"><Prose>{sections.lifestyle}</Prose></SectionCard>}
          {sections.longevity && <SectionCard title="Longevity Levers"><Prose>{sections.longevity}</Prose></SectionCard>}
          {sections.try && <SectionCard title="This Week Try"><Prose>{sections.try}</Prose></SectionCard>}

          <div className="flex justify-center mt-8">
            <div className="relative group">
              <button
                onClick={exportPDF}
                aria-label="Export PDF"
                className="w-10 h-10 flex items-center justify-center rounded-md border border-gray-300 bg-white shadow-sm hover:shadow-md transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-6 h-6">
                  <rect x="2" y="2"
