// app/results/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CTAButton from "@/components/CTAButton";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// --- Simple card wrapper ---
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-[#06C1A0] mb-4">{title}</h2>
      {children}
    </div>
  );
}

function ResultsContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const searchParams = useSearchParams();
  const tallyId = searchParams?.get("tally_submission_id") ?? null;

  // --- Pre-check existing stack ---
  async function fetchStack() {
    if (!tallyId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/get-stack?submission_id=${encodeURIComponent(tallyId)}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (data?.ok && data?.stack) {
        setMarkdown(
          data.stack.sections?.markdown ??
            data.stack.summary ??
            null
        );
      }
    } catch (err: any) {
      console.warn("No existing stack found:", err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Generate new stack ---
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
        setMarkdown(
          data.stack.sections?.markdown ??
            data.ai?.markdown ??
            data.stack.summary ??
            null
        );
      } else {
        setError(data?.error ?? "No stack returned");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // --- Export PDF ---
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

      {/* Action bar */}
      <SectionCard title="Actions">
        <div className="flex flex-wrap gap-4 justify-center">
          <CTAButton onClick={generateStack} variant="primary" disabled={generating}>
            {generating ? "🤖 Generating..." : "✨ Generate Free Report"}
          </CTAButton>
          <CTAButton href="/pricing" variant="premium">
            👑 Upgrade to Premium
          </CTAButton>
          <CTAButton onClick={exportPDF} variant="secondary">
            📄 Export PDF
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

      {/* Report body */}
      {markdown && (
        <div className="space-y-6">
          <SectionCard title="Summary">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-gray max-w-none">
              {markdown.split("## Goals")[0]}
            </ReactMarkdown>
          </SectionCard>

          <SectionCard title="Goals">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-gray max-w-none">
              {"## Goals" + markdown.split("## Goals")[1].split("## Contra")[0]}
            </ReactMarkdown>
          </SectionCard>

          <SectionCard title="Contraindications & Med Interactions">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-gray max-w-none">
              {"## Contraindications" + markdown.split("## Contra")[1].split("## Current")[0]}
            </ReactMarkdown>
          </SectionCard>

          <SectionCard title="Current Stack">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-gray max-w-none">
              {"## Current" + markdown.split("## Current")[1].split("## Recommended")[0]}
            </ReactMarkdown>
          </SectionCard>

          <SectionCard title="Recommended Stack">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-gray max-w-none">
              {"## Recommended" + markdown.split("## Recommended")[1].split("## Dosing")[0]}
            </ReactMarkdown>
          </SectionCard>

          <SectionCard title="Dosing & Notes">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-gray max-w-none">
              {"## Dosing" + markdown.split("## Dosing")[1].split("## Evidence")[0]}
            </ReactMarkdown>
          </SectionCard>

          <SectionCard title="Evidence & References">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-gray max-w-none">
              {"## Evidence" + markdown.split("## Evidence")[1].split("## Shopping")[0]}
            </ReactMarkdown>
          </SectionCard>

          <SectionCard title="Shopping Links">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-gray max-w-none">
              {"## Shopping" + markdown.split("## Shopping")[1].split("## Follow")[0]}
            </ReactMarkdown>
          </SectionCard>

          <SectionCard title="Follow-up Plan">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-gray max-w-none">
              {"## Follow" + markdown.split("## Follow")[1]}
            </ReactMarkdown>
          </SectionCard>

          {/* Extra beautified sections */}
          <SectionCard title="Lifestyle Prescriptions">
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Protein: aim 120–150 g/day.</li>
              <li>Breakfast anchor: 30+ g protein within 2h of waking.</li>
              <li>Fiber: 25–35 g/day; add chia/flax.</li>
              <li>Sleep: lights-down 60 min before bed.</li>
              <li>Exercise: 2–3 strength + 2–3 cardio days/week.</li>
            </ul>
          </SectionCard>

          <SectionCard title="Longevity Levers">
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Resistance training 2x/week preserves lean mass.</li>
              <li>7–8 hrs consistent sleep for repair.</li>
              <li>120–150 g protein daily supports metabolism.</li>
              <li>Daily walks improve cardiovascular & brain health.</li>
            </ul>
          </SectionCard>

          <SectionCard title="This Week Try">
            <p className="text-gray-700">Lights down + screens off 60 minutes before bed for 5 nights. Track sleep quality and morning energy.</p>
          </SectionCard>

          <SectionCard title="Self-Tracking Dashboard">
            <table className="w-full border border-gray-200 text-sm">
              <thead className="bg-[#06C1A0] text-white">
                <tr>
                  <th className="p-2">Metric</th>
                  <th className="p-2">Target</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border p-2">Energy</td><td className="border p-2">1–10 daily</td></tr>
                <tr><td className="border p-2">Sleep</td><td className="border p-2">1–5 stars</td></tr>
                <tr><td className="border p-2">Steps</td><td className="border p-2">7–10k/day</td></tr>
                <tr><td className="border p-2">Mood</td><td className="border p-2">Emoji/word</td></tr>
                <tr><td className="border p-2">Blood Pressure</td><td className="border p-2">3x/week</td></tr>
              </tbody>
            </table>
          </SectionCard>
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
