"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CTAButton from "@/components/CTAButton";

/* ───────── helpers ───────── */

function sanitizeMarkdown(md: string): string {
  return md
    ? md.replace(/^```[a-z]*\n/i, "").replace(/```$/, "").trim()
    : md;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(md: string, heads: string[]): string | null {
  if (!md) return null;
  let start = -1;
  for (const h of heads) {
    const re = new RegExp(`^##\\s*${escapeRegExp(h)}\\b.*`, "mi");
    const m = re.exec(md);
    if (m && (start === -1 || (m.index ?? -1) < start)) start = m.index;
  }
  if (start === -1) return null;
  const tail = md.slice(start + 1);
  const next = /\n##\s+/m.exec(tail);
  const end  = next ? start + 1 + next.index : md.length;
  let slice  = md.slice(start, end);
  return slice.replace(/^##\s*[^\n]+\n?/, "").trim();
}

function Prose({ children }: { children: string }) {
  return (
    <div className="prose prose-gray max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-[#06C1A0] mb-4">{title}</h2>
      {children}
    </div>
  );
}

/* ───────── page ───────── */

function ResultsContent() {
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const searchParams = useSearchParams();
  const tallyId = searchParams?.get("tally_submission_id") ?? null;

  async function api(path: string, body?: any) {
    const res = await fetch(
      path,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}
    );
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  }

  useEffect(() => {
    if (!tallyId) return;
    (async () => {
      try {
        const data = await api(
          `/api/get-stack?submission_id=${encodeURIComponent(tallyId)}`
        );
        const raw = data?.stack?.sections?.markdown ?? data?.stack?.summary ?? "";
        setMarkdown(sanitizeMarkdown(raw));
      } catch (e: any) {
        console.warn(e);
      }
    })();
  }, [tallyId]);

  async function generateStack() {
    if (!tallyId) return setError("Missing submission ID.");
    try {
      setGenerating(true);
      setError(null);
      const data = await api("/api/generate-stack", {
        tally_submission_id: tallyId,
      });
      const raw =
        data?.stack?.sections?.markdown ??
        data?.ai?.markdown ??
        data?.stack?.summary ??
        "";
      setMarkdown(sanitizeMarkdown(raw));
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  async function exportPDF() {
    if (!tallyId) return;
    try {
      const res = await fetch(`/api/export-pdf?submission_id=${tallyId}`);
      if (!res.ok) throw new Error(`PDF export failed (${res.status})`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch (e: any) {
      setError(e.message ?? "PDF export failed");
    }
  }

  /* ---- extract sections (no disclaimers) ---- */
  const sec = useMemo(() => {
    const md = markdown ?? "";
    return {
      intro:       extractSection(md, ["Intro Summary", "Summary"]),
      goals:       extractSection(md, ["Goals"]),
      contra:      extractSection(md, ["Contraindications & Med Interactions", "Contraindications"]),
      current:     extractSection(md, ["Current Stack"]),
      blueprint:   extractSection(md, [
        "Your Blueprint Recommendations",
        'High-Impact "Bang-for-Buck" Additions',
        "High-Impact Bang-for-Buck Additions",
      ]),
      dosing:      extractSection(md, ["Dosing & Notes", "Dosing"]),
      evidence:    extractSection(md, ["Evidence & References"]),
      shopping:    extractSection(md, ["Shopping Links"]),
      follow:      extractSection(md, ["Follow-up Plan"]),
      lifestyle:   extractSection(md, ["Lifestyle Prescriptions"]),
      longevity:   extractSection(md, ["Longevity Levers"]),
      weekTry:     extractSection(md, ["This Week Try", "Weekly Experiment"]),
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

      {sec.intro       && <SectionCard title="Intro Summary"><Prose>{sec.intro}</Prose></SectionCard>}
      {sec.goals       && <SectionCard title="Goals"><Prose>{sec.goals}</Prose></SectionCard>}
      {sec.contra      && <SectionCard title="Contraindications & Med Interactions"><Prose>{sec.contra}</Prose></SectionCard>}
      {sec.current     && <SectionCard title="Current Stack"><Prose>{sec.current}</Prose></SectionCard>}
      {sec.blueprint   && <SectionCard title="Your Blueprint Recommendations"><Prose>{sec.blueprint}</Prose></SectionCard>}
      {sec.dosing      && <SectionCard title="Dosing & Notes"><Prose>{sec.dosing}</Prose></SectionCard>}
      {sec.evidence    && <SectionCard title="Evidence & References"><Prose>{sec.evidence}</Prose></SectionCard>}
      {sec.shopping    && <SectionCard title="Shopping Links"><Prose>{sec.shopping}</Prose></SectionCard>}
      {sec.follow      && <SectionCard title="Follow-up Plan"><Prose>{sec.follow}</Prose></SectionCard>}
      {sec.lifestyle   && <SectionCard title="Lifestyle Prescriptions"><Prose>{sec.lifestyle}</Prose></SectionCard>}
      {sec.longevity   && <SectionCard title="Longevity Levers"><Prose>{sec.longevity}</Prose></SectionCard>}
      {sec.weekTry     && <SectionCard title="This Week Try"><Prose>{sec.weekTry}</Prose></SectionCard>}

      {/* Static Disclaimer (always rendered at bottom) */}
      <SectionCard title="Important Wellness Disclaimer">
        <p className="text-sm text-gray-700 leading-relaxed">
          This plan from <strong>LVE360 (Longevity | Vitality | Energy)</strong> is for
          educational purposes only and is not medical advice. It is not intended to diagnose,
          treat, cure, or prevent any disease. Always consult with your healthcare provider
          before starting new supplements or making significant lifestyle changes, especially
          if you are pregnant, nursing, managing a medical condition, or taking prescriptions.
          Supplements are regulated under the Dietary Supplement Health and Education Act
          (DSHEA); results vary and no outcomes are guaranteed. If you experience unexpected
          effects, discontinue use and seek professional care. By using this report, you agree
          that decisions about your health remain your responsibility and that LVE360 is not
          liable for how information is applied.
        </p>
      </SectionCard>

      <div className="flex justify-center mt-8">
        <button
          onClick={exportPDF}
          aria-label="Export PDF"
          className="w-10 h-10 flex items-center justify-center rounded-md border border-gray-300 bg-white shadow-sm hover:shadow-md transition"
        >
          PDF
        </button>
      </div>
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
