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
  const end = next ? start + 1 + next.index : md.length;
  let slice = md.slice(start, end);
  return slice.replace(/^##\s*[^\n]+\n?/, "").trim();
}

/* Markdown renderer */
function Prose({ children }: { children: string }) {
  return (
    <div className="prose prose-gray max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ node, ...props }) => (
            <h2
              className="text-2xl font-bold text-teal-600 mt-8 mb-4 border-b border-gray-200 pb-1"
              {...props}
            />
          ),
          table: ({ node, ...props }) => (
            <table
              className="w-full border-collapse my-4 text-sm shadow-sm"
              {...props}
            />
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-[#06C1A0] text-white" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-3 py-0.5 text-left font-semibold" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-3 py-0.5 border-t border-gray-200 align-middle" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="even:bg-gray-50" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-[#041B2D]" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/* Evidence + Shopping table */
function LinksTable({
  raw,
  type,
}: {
  raw: string;
  type: "evidence" | "shopping";
}) {
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

  const lines = raw.split("\n").map((l) => l.trim());
  const bulletLines = lines.filter((l) => l.startsWith("-"));
  const analysisIndex = lines.findIndex((l) =>
    l.toLowerCase().startsWith("**analysis")
  );
  const analysis =
    analysisIndex !== -1 ? lines.slice(analysisIndex).join(" ") : null;

  const rows = bulletLines
    .map((line) => {
      const matches = Array.from(line.matchAll(linkRe));
      if (matches.length === 0) return null;

      const namePart = line.replace(/^-+\s*/, "").split(":")[0].trim();
      if (namePart.toLowerCase().includes("evidence pending")) {
        return null; // ✅ skip placeholder rows
      }

      const links = matches.map((m) => ({
        text: m[1],
        url: m[2],
      }));

      return { name: namePart, links };
    })
    .filter(Boolean) as { name: string; links: { text: string; url: string }[] }[];

  // Add-All-to-Cart
  let allCartUrl: string | null = null;
  if (type === "shopping") {
    const asinRegex = /(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[/?]|$)/;
    const asins = rows
      .flatMap((r) =>
        r.links.map((link) => {
          const m = asinRegex.exec(link.url);
          return m ? m[1] : null;
        })
      )
      .filter(Boolean) as string[];

    if (asins.length > 0) {
      const parts = asins.map(
        (asin, i) => `ASIN.${i + 1}=${asin}&Quantity.${i + 1}=1`
      );
      allCartUrl = `https://www.amazon.com/gp/aws/cart/add.html?${parts.join("&")}&tag=lve360-20`;
    }
  }

  return (
    <div>
      <table className="w-full border-collapse my-2 text-sm shadow-sm">
        <thead className="bg-[#06C1A0] text-white">
          <tr>
            <th className="px-3 py-0.5 text-left">Item</th>
            <th className="px-3 py-0.5 text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="even:bg-gray-50 border-t">
              <td className="px-3 py-0.5">{r.name}</td>
              <td className="px-3 py-0.5 space-x-2">
                {r.links.map((link, j) => (
                  <CTAButton
                    key={j}
                    href={link.url}
                    variant={type === "shopping" ? "primary" : "secondary"}
                    size="sm"
                    className="px-2 py-0.5 text-xs min-w-0"
                  >
                    {type === "shopping"
                      ? `Buy on ${link.text}`
                      : link.text}
                  </CTAButton>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {allCartUrl && (
        <div className="mt-3">
          <CTAButton
            href={allCartUrl}
            variant="premium"
            size="md"
            className="px-4 py-2 text-sm"
          >
            🛒 Add All to Cart
          </CTAButton>
        </div>
      )}

      {analysis && (
        <p className="mt-3 text-sm text-gray-700 leading-relaxed">{analysis}</p>
      )}
    </div>
  );
}

/* Section card wrapper */
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
  const [warmingUp, setWarmingUp] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [ready, setReady] = useState(true);

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
        const raw =
          data?.stack?.sections?.markdown ?? data?.stack?.summary ?? "";
        setMarkdown(sanitizeMarkdown(raw));
      } catch (e: any) {
        console.warn(e);
      }
    })();
  }, [tallyId]);

  async function generateStack() {
    if (!tallyId) return setError("Missing submission ID.");
    try {
      setWarmingUp(true);
      setError(null);
      await new Promise((r) => setTimeout(r, 3000));
      setWarmingUp(false);
      setGenerating(true);

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
      setWarmingUp(false);
    }
  }

  async function exportPDF() {
    if (!tallyId) return;
    try {
      const res = await fetch(`/api/export-pdf?submission_id=${tallyId}`);
      if (!res.ok) throw new Error(`PDF export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch (e: any) {
      setError(e.message ?? "PDF export failed");
    }
  }

  const sec = useMemo(() => {
    const md = markdown ?? "";
    return {
      intro: extractSection(md, ["Intro Summary", "Summary"]),
      goals: extractSection(md, ["Goals"]),
      contra: extractSection(md, [
        "Contraindications & Med Interactions",
        "Contraindications",
      ]),
      current: extractSection(md, ["Current Stack"]),
      blueprint: extractSection(md, [
        "Your Blueprint Recommendations",
        'High-Impact "Bang-for-Buck" Additions',
        "High-Impact Bang-for-Buck Additions",
      ]),
      dosing: extractSection(md, ["Dosing & Notes", "Dosing"]),
      evidence: extractSection(md, ["Evidence & References"]),
      shopping: extractSection(md, ["Shopping Links"]),
      follow: extractSection(md, ["Follow-up Plan"]),
      lifestyle: extractSection(md, ["Lifestyle Prescriptions"]),
      longevity: extractSection(md, ["Longevity Levers"]),
      weekTry: extractSection(md, ["This Week Try", "Weekly Experiment"]),
    };
  }, [markdown]);

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 font-sans">
      {/* header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold font-display text-[#041B2D]">
          Your LVE360 Blueprint
        </h1>
        <p className="text-gray-600 mt-2">
          Personalized insights for Longevity • Vitality • Energy
        </p>
      </div>

      {/* actions */}
      <SectionCard title="Actions">
        <div className="flex flex-wrap gap-4 justify-center">
          <CTAButton
            onClick={generateStack}
            variant="gradient"
            disabled={warmingUp || generating || !ready}
          >
            {warmingUp
              ? "⏳ Warming up…"
              : generating
              ? "🤖 Generating..."
              : ready
              ? "✨ Generate Free Report"
              : "⏳ Preparing…"}
          </CTAButton>

          <CTAButton href="/pricing" variant="premium">
            👑 Upgrade to Premium
          </CTAButton>
        </div>
        {(warmingUp || generating) && (
          <p className="text-center text-gray-500 mt-3 text-sm animate-pulse">
            {warmingUp
              ? "⚡ Warming up the AI engines..."
              : "💪 Crunching the numbers… this usually takes about 2 minutes."}
          </p>
        )}
      </SectionCard>

      {error && <div className="text-center text-red-600 mb-6">{error}</div>}

      {/* sections */}
      {sec.intro && (
        <SectionCard title="Intro Summary">
          <Prose>{sec.intro}</Prose>
        </SectionCard>
      )}
      {sec.goals && (
        <SectionCard title="Goals">
          <Prose>{sec.goals}</Prose>
        </SectionCard>
      )}
      {sec.contra && (
        <SectionCard title="Contraindications & Med Interactions">
          <Prose>{sec.contra}</Prose>
        </SectionCard>
      )}
      {sec.current && (
        <SectionCard title="Current Stack">
          <Prose>{sec.current}</Prose>
        </SectionCard>
      )}
      {sec.blueprint && (
        <SectionCard title="Your Blueprint Recommendations">
          <Prose>{sec.blueprint}</Prose>
        </SectionCard>
      )}
      {sec.dosing && (
        <SectionCard title="Dosing & Notes">
          <Prose>{sec.dosing}</Prose>
        </SectionCard>
      )}
      {sec.evidence && (
        <SectionCard title="Evidence & References">
          <LinksTable raw={sec.evidence} type="evidence" />
        </SectionCard>
      )}
      {sec.shopping && (
        <SectionCard title="Shopping Links">
          <LinksTable raw={sec.shopping} type="shopping" />
        </SectionCard>
      )}
      {sec.follow && (
        <SectionCard title="Follow-up Plan">
          <Prose>{sec.follow}</Prose>
        </SectionCard>
      )}
      {sec.lifestyle && (
        <SectionCard title="Lifestyle Prescriptions">
          <Prose>{sec.lifestyle}</Prose>
        </SectionCard>
      )}
      {sec.longevity && (
        <SectionCard title="Longevity Levers">
          <Prose>{sec.longevity}</Prose>
        </SectionCard>
      )}
      {sec.weekTry && (
        <SectionCard title="This Week Try">
          <Prose>{sec.weekTry}</Prose>
        </SectionCard>
      )}

      {/* disclaimer */}
      <SectionCard title="Important Wellness Disclaimer">
        <p className="text-sm text-gray-700 leading-relaxed">
          This plan from <strong>LVE360 (Longevity | Vitality | Energy)</strong>{" "}
          is for educational purposes only and is not medical advice. It is not
          intended to diagnose, treat, cure, or prevent any disease. Always
          consult with your healthcare provider before starting new supplements
          or making significant lifestyle changes, especially if you are
          pregnant, nursing, managing a medical condition, or taking
          prescriptions. Supplements are regulated under the Dietary Supplement
          Health and Education Act (DSHEA); results vary and no outcomes are
          guaranteed. If you experience unexpected effects, discontinue use and
          seek professional care. By using this report, you agree that decisions
          about your health remain your responsibility and that LVE360 is not
          liable for how information is applied.
        </p>
      </SectionCard>

      {/* export PDF */}
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
