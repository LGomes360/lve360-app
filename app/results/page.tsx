"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import CTAButton from "@/components/CTAButton";
import ResultsSidebar from "@/components/results/ResultsSidebar";

/* ───────── helpers ───────── */
function sanitizeMarkdown(md: string): string {
  // Strip code fences and trailing guardrail marker
  return (md || "")
    .replace(/^```[a-z]*\n/i, "")
    .replace(/```$/, "")
    .replace(/\n?## END\s*$/i, "")
    .trim();
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
  const slice = md.slice(start, end);
  return slice.replace(/^##\s*[^\n]+\n?/, "").trim();
}
// --- fetch with retry + timeout (client-side) ---
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  tries = 3,
  baseDelayMs = 500,
  timeoutMs = 15000
) {
  let delay = baseDelayMs;

  for (let i = 0; i < tries; i++) {
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const res = await fetch(url, { ...init, signal, cache: "no-store" });
      // Retry only on transient errors
      if ((res.status >= 500 || res.status === 429) && i < tries - 1) {
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 4000);
        continue;
      }
      return res;
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 4000);
    }
  }
  // unreachable
  throw new Error("Exhausted retries");
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
            <table className="w-full border-collapse my-4 text-sm shadow-sm" {...props} />
          ),
          thead: ({ node, ...props }) => <thead className="bg-[#06C1A0] text-white" {...props} />,
          th: ({ node, ...props }) => <th className="px-3 py-0.5 text-left font-semibold" {...props} />,
          td: ({ node, ...props }) => (
            <td className="px-3 py-0.5 border-t border-gray-200 align-middle" {...props} />
          ),
          tr: ({ node, ...props }) => <tr className="even:bg-gray-50" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold text-[#041B2D]" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/* Evidence + Shopping table */
function LinksTable({ raw, type }: { raw: string; type: "evidence" | "shopping" }) {
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

  const lines = raw.split("\n").map((l) => l.trim());
  const bulletLines = lines.filter((l) => l.startsWith("-"));
  const analysisIndex = lines.findIndex((l) => l.toLowerCase().startsWith("**analysis"));
  const analysis = analysisIndex !== -1 ? lines.slice(analysisIndex).join(" ") : null;

  const rows = bulletLines
    .map((line) => {
      const matches = Array.from(line.matchAll(linkRe));
      if (matches.length === 0) return null;
      const namePart = line.replace(/^-+\s*/, "").split(":")[0].trim();
      if (namePart.toLowerCase().includes("evidence pending")) return null; // skip placeholders
      const links = matches.map((m) => ({ text: m[1], url: m[2] }));
      return { name: namePart, links };
    })
    .filter(Boolean) as { name: string; links: { text: string; url: string }[] }[];

  // Add-All-to-Cart for Amazon
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
      const parts = asins.map((asin, i) => `ASIN.${i + 1}=${asin}&Quantity.${i + 1}=1`);
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
                    {type === "shopping" ? `Buy on ${link.text}` : link.text}
                  </CTAButton>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {allCartUrl && (
        <div className="mt-3">
          <CTAButton href={allCartUrl} variant="premium" size="md" className="px-4 py-2 text-sm">
            🛒 Add All to Cart
          </CTAButton>
        </div>
      )}

      {analysis && <p className="mt-3 text-sm text-gray-700 leading-relaxed">{analysis}</p>}
    </div>
  );
}

/* Section card wrapper */
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-[#06C1A0] mb-4">{title}</h2>
      {children}
    </div>
  );
}

/* --- Tiny stepper: Warm-up → Generating → Done (or Error) --- */
function Stepper({
  state,
}: {
  state: "idle" | "warmup" | "generating" | "done" | "error";
}) {
  const steps = ["Warm-up", "Generating", "Done"] as const;
  const activeIndex =
    state === "warmup" ? 0 : state === "generating" ? 1 : state === "done" ? 2 : -1;
  const isError = state === "error";

  return (
    <div className="flex items-center justify-center gap-3 text-sm mt-3">
      {steps.map((s, i) => {
        const active = i === activeIndex;
        const completed = activeIndex > i;
        const base =
          "px-2.5 py-1 rounded-full border transition";
        const cls =
          isError && i <= 1
            ? `${base} border-red-300 bg-red-50 text-red-700`
            : active
            ? `${base} border-teal-300 bg-teal-50 text-teal-700`
            : completed
            ? `${base} border-teal-400 bg-teal-100 text-teal-800`
            : `${base} border-gray-200 bg-gray-50 text-gray-600`;
        return (
          <div key={s} className="flex items-center gap-2">
            <span className={cls}>{s}</span>
            {i < steps.length - 1 && (
              <span className="text-gray-300">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --- 2-minute countdown --- */
function TwoMinuteCountdown({
  running,
  onDone,
  seconds = 120,
}: {
  running: boolean;
  onDone?: () => void;
  seconds?: number;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (!running) {
      setRemaining(seconds);
      return;
    }
    setRemaining(seconds);
    const id = setInterval(() => {
      setRemaining((t) => {
        if (t <= 1) {
          clearInterval(id);
          onDone?.();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, seconds, onDone]);

  if (!running) return null;

  const m = Math.floor(remaining / 60);
  const s = (remaining % 60).toString().padStart(2, "0");
  const pct = ((seconds - remaining) / seconds) * 100;

  return (
    <div className="text-center mt-3">
      <p className="text-gray-600">
        ⏱ Estimated time remaining:{" "}
        <span className="font-semibold text-teal-600">
          {m}:{s}
        </span>
      </p>
      <div className="w-64 h-2 bg-gray-200 rounded-full mt-2 mx-auto">
        <div
          className="h-2 bg-teal-500 rounded-full transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
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
  const [stackId, setStackId] = useState<string | null>(null);
  const [flow, setFlow] = useState<"idle" | "warmup" | "generating" | "done" | "error">("idle");

  const searchParams = useSearchParams();
  // accept either ?tally_submission_id=... OR ?submissionId=/submission_id=
  const tallyId       = searchParams?.get("tally_submission_id");
  const submissionId1 = searchParams?.get("submission_id");
  const submissionId2 = searchParams?.get("submissionId");
  const submissionId  = submissionId1 ?? submissionId2;
  const anyId         = tallyId ?? submissionId; // <- use this going forward

async function api(path: string, body?: any) {
  const init: RequestInit =
    body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { method: "GET" };

  // 3 tries, 0.5s → 1s → 2s backoff, 15s per-attempt timeout
  const res = await fetchWithRetry(path, init, 3, 500, 15000);

  // Try to read JSON; if it fails, surface status
  let json: any = {};
  try { json = await res.json(); } catch {}

  if (!res.ok || json?.ok === false) {
    const msg = json?.error ? String(json.error) : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}


    // Load any existing stack
    useEffect(() => {
      if (!anyId) return;
      (async () => {
        try {
          // choose the right query param name for your API
          const qp = tallyId
            ? `tally_submission_id=${encodeURIComponent(tallyId)}`
            : `submission_id=${encodeURIComponent(anyId)}`;
    
          const data = await api(`/api/get-stack?${qp}`);
          const raw = data?.stack?.sections?.markdown ?? data?.stack?.summary ?? "";
          setMarkdown(sanitizeMarkdown(raw));
          setStackId(data?.stack?.id ?? null);
        } catch (e: any) {
          console.warn(e);
        }
      })();
    }, [anyId, tallyId]);

    async function generateStack() {
      if (!anyId) {
        setError("Missing submission ID.");
        return;
      }
    
      try {
        setError(null);
        setFlow("warmup");
        setWarmingUp(true);
        await new Promise((r) => setTimeout(r, 800));
        setWarmingUp(false);
        setFlow("generating");
        setGenerating(true);
    
        // Kick off generation with whichever id we have
        const payload: { tally_submission_id?: string; submission_id?: string } = tallyId
          ? { tally_submission_id: tallyId as string }
          : { submission_id: anyId as string };
    
        const data = await api("/api/generate-stack", payload);
    
        // Show something immediately if we have it
        const first =
          data?.ai?.markdown ??
          data?.stack?.sections?.markdown ??
          data?.stack?.summary ??
          "";
        if (first) setMarkdown(sanitizeMarkdown(first));
    
        // Clean re-fetch to ensure DB state is synced
        const qp2 = tallyId
          ? `tally_submission_id=${encodeURIComponent(tallyId as string)}`
          : `submission_id=${encodeURIComponent(anyId as string)}`;
    
        const refreshed = await api(`/api/get-stack?${qp2}`);
        const finalMd =
          refreshed?.stack?.sections?.markdown ??
          refreshed?.stack?.summary ??
          first;
    
        setMarkdown(sanitizeMarkdown(finalMd));
        setStackId(refreshed?.stack?.id ?? data?.stack?.id ?? null);
    
        setFlow("done");
      } catch (e: any) {
        setError(e?.message ?? "Unknown error");
        setFlow("error");
      } finally {
        setGenerating(false);
        setWarmingUp(false);
      }
    }


  async function exportPDF() {
    if (!tallyId) return;
    try {
      const res = await fetch(`/api/export-pdf?submission_id=${encodeURIComponent(tallyId)}`);
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
      contra: extractSection(md, ["Contraindications & Med Interactions", "Contraindications"]),
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
    <motion.main
      className="relative isolate overflow-hidden min-h-screen bg-gradient-to-br from-[#F8F5FB] via-white to-[#EAFBF8]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Ambient Background */}
      <div
        className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[#A8F0E4] opacity-40 blur-3xl animate-[float_8s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-[20rem] -right-24 h-[28rem] w-[28rem] rounded-full bg-[#D9C2F0] opacity-30 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto py-20 px-6 font-sans">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-[#041B2D] via-[#06C1A0] to-purple-600 bg-clip-text text-transparent">
            Your LVE360 Blueprint
          </h1>
          <p className="text-gray-600 mt-4 text-lg">Personalized insights for Longevity • Vitality • Energy</p>
          <p className="mt-2 text-gray-500 text-sm">$15/month Premium Access</p>
        </div>

        {/* two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT */}
          <div className="lg:col-span-8">
            {/* actions */}
            <SectionCard title="Actions">
              <div className="flex flex-wrap gap-4 justify-center">
                <CTAButton onClick={generateStack} variant="gradient" disabled={warmingUp || generating || !ready}>
                  {warmingUp ? "⏳ Warming up…" : generating ? "🤖 Generating..." : ready ? "✨ Generate Free Report" : "⏳ Preparing…"}
                </CTAButton>
                <CTAButton href="/upgrade" variant="premium">
                  Upgrade to Premium
                </CTAButton>
              </div>

              {/* tiny stepper + status text */}
              {(warmingUp || generating || flow === "done" || flow === "error") && (
                <>
                  <Stepper state={flow} />
                  <p className="text-center text-gray-500 mt-2 text-sm">
                    {flow === "warmup"
                      ? "⚡ Warming up the AI engines..."
                      : flow === "generating"
                      ? "💪 Crunching the numbers… this usually takes about 2 minutes."
                      : flow === "done"
                      ? "✅ Done! Your personalized plan is ready."
                      : flow === "error"
                      ? "❌ Something went wrong. Please try again."
                      : null}
                  </p>
                </>
              )}

              {/* 2-minute countdown while generating */}
              <TwoMinuteCountdown running={generating} />
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
                This plan from <strong>LVE360 (Longevity | Vitality | Energy)</strong> is for educational purposes only
                and is not medical advice. It is not intended to diagnose, treat, cure, or prevent any disease. Always
                consult with your healthcare provider before starting new supplements or making significant lifestyle
                changes, especially if you are pregnant, nursing, managing a medical condition, or taking prescriptions.
                Supplements are regulated under the Dietary Supplement Health and Education Act (DSHEA); results vary
                and no outcomes are guaranteed. If you experience unexpected effects, discontinue use and seek
                professional care. By using this report, you agree that decisions about your health remain your
                responsibility and that LVE360 is not liable for how information is applied.
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

          {/* RIGHT: sticky sidebar */}
          <div className="lg:col-span-4">
            {stackId ? (
              <ResultsSidebar stackId={stackId} />
            ) : (
              <div className="rounded-xl border p-4 text-sm text-gray-600">
                Sidebar will appear after your stack loads.
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.main>
  );
}

export default function ResultsPageWrapper() {
  return (
    <Suspense fallback={<p className="text-center py-8">Loading...</p>}>
      <ResultsContent />
    </Suspense>
  );
}
