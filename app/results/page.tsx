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
  let matchedHeading = "";
  for (const h of headingVariants) {
    const re = new RegExp(`^##\\s*${escapeRegExp(h)}\\b.*`, "mi");
    const m = re.exec(md);
    if (m && (startIdx === -1 || (m.index ?? -1) < startIdx)) {
      startIdx = m.index;
      matchedHeading = h;
    }
  }
  if (startIdx === -1) return null;
  const tail = md.slice(startIdx + 1);
  const next = /\n##\s+/m.exec(tail);
  const endIdx = next ? startIdx + 1 + next.index : md.length;
  const slice = md.slice(startIdx, endIdx);
  return slice.includes(`## ${matchedHeading}`)
    ? slice
    : `## ${matchedHeading}\n${slice}`;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tallyId]);

  const sections = useMemo(() => {
    const md = markdown ?? "";
    return {
      summary: extractSection(md, ["Summary"]),
      goals: extractSection(md, ["Goals"]),
      contra: extractSection(md, [
        "Contraindications/Med-Interactions",
        "Contraindications & Med-Interactions",
        "Contraindications",
        "Medication & Contraindication Review",
        "Medication & Contraindications",
      ]),
      current: extractSection(md, ["Current Stack", "Current Supplements"]),
      recommended: extractSection(md, [
        "Recommended Stack",
        "Full Recommended Stack",
        "Optimized Plan (AM / PM / Bedtime)",
        "Busy-Pro Friendly Plan (2 doses/day)",
      ]),
      dosing: extractSection(md, [
        "Dosing & Notes",
        "Dosing and Notes",
        "Dosing",
        "Notes",
        "Bang-for-Buck Additions (Ranked)",
      ]),
      evidence: extractSection(md, ["Evidence & References", "References", "Evidence"]),
      shopping: extractSection(md, ["Shopping Links", "Shopping", "Links"]),
      follow: extractSection(md, ["Follow-up Plan", "Follow Up Plan", "Follow-up Plan", "Follow-up"]),
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

          {/* Static sections */}
          <SectionCard title="Lifestyle Prescriptions">
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Protein: aim 120–150 g/day (palm of protein each meal + shake).</li>
              <li>Breakfast anchor: 30+ g protein within 2 hours of waking.</li>
              <li>Fiber: 25–35 g/day; veggies/legumes/chia/flax; add 1 tbsp chia to yogurt or shake.</li>
              <li>Sleep: lights-down 60 min before bed; cool, dark, quiet room.</li>
              <li>Exercise: 2–3 strength + 2–3 cardio/steps days per week.</li>
              <li>After-meal walks: 10 min after dinner for glucose control.</li>
            </ul>
          </SectionCard>

          <SectionCard title="Longevity Levers">
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Resistance training 2x/week preserves lean mass and bone density.</li>
              <li>Prioritize 7–8 hours of consistent sleep for cellular repair.</li>
              <li>120–150 g protein daily supports metabolism and healthy aging.</li>
              <li>Add short daily walks to boost cardiovascular and brain health.</li>
            </ul>
          </SectionCard>

          <SectionCard title="This Week Try">
            <p className="text-gray-700">
              Lights down + screens off 60 minutes before bed for 5 nights. Track sleep quality and next-morning energy.
            </p>
          </SectionCard>

          <SectionCard title="Self-Tracking Dashboard">
            <table className="w-full border border-gray-200 text-sm">
              <thead className="bg-[#06C1A0] text-white">
                <tr>
                  <th className="p-2 text-left">Metric</th>
                  <th className="p-2 text-left">Target</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border p-2">Energy</td><td className="border p-2">1–10 (daily)</td></tr>
                <tr><td className="border p-2">Sleep</td><td className="border p-2">1–5 stars</td></tr>
                <tr><td className="border p-2">Steps</td><td className="border p-2">7–10k/day</td></tr>
                <tr><td className="border p-2">Mood</td><td className="border p-2">Emoji/word</td></tr>
                <tr><td className="border p-2">Blood Pressure</td><td className="border p-2">3x/week</td></tr>
              </tbody>
            </table>
          </SectionCard>

          {/* Export PDF at bottom */}
          <div className="flex justify-center mt-10">
            <CTAButton onClick={exportPDF} variant="subtle" size="md" iconOnly aria-label="Export PDF">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-7 h-7 transition-transform transform hover:scale-110"
              >
                {/* Document outline */}
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
                {/* PDF badge */}
                <rect x="6" y="14" width="12" height="6" rx="2" fill="#E63946" className="transition-colors hover:fill-red-600" />
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
                {/* Teal arrow */}
                <path
                  d="M12 6v5m0 0l-2-2m2 2l2-2"
                  stroke="#06C1A0"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-colors hover:stroke-emerald-500"
                />
              </svg>
            </CTAButton>
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
