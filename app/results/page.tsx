"use client";

import { isValidElement, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import CTAButton from "@/components/CTAButton";
import ResultsSidebar from "@/components/results/ResultsSidebar";
import { buildBlueprintActionCandidates } from "@/lib/blueprintActions";
import { parseBlueprintReport } from "@/lib/blueprintReport";
import { blueprintStatusTone, cleanReportDisplayText, reportSectionTitle } from "@/lib/reportPresentation";
import { AFFILIATE_DISCLOSURE_NEAR_LINKS, AFFILIATE_DISCLOSURE_SUPPORT } from "@/lib/reportDisclosures";

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
  const tail = md.slice(start);
  const next = /\n##\s+/m.exec(tail);
  const end = next ? start + next.index : md.length;
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
function textFromNode(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textFromNode).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) return textFromNode(value.props.children);
  return "";
}

function Prose({ children }: { children: string }) {
  return (
    <div className="report-prose prose prose-gray max-w-none text-[#1F2937]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ node, ...props }) => (
            <h2
              className="mt-8 mb-4 border-b border-slate-200 pb-2 text-2xl font-bold text-[#122945]"
              {...props}
            />
          ),
          table: ({ node, ...props }) => <table className="my-4 w-full border-collapse overflow-hidden text-sm" {...props} />,
          thead: ({ node, ...props }) => <thead className="bg-[#122945] text-white" {...props} />,
          th: ({ node, ...props }) => <th className="px-3 py-2 text-left font-semibold" {...props} />,
          td: ({ node, children, ...props }) => {
            const tone = blueprintStatusTone(textFromNode(children));
            return (
              <td className="border-t border-[#D1DBE0] px-3 py-2 align-top" {...props}>
                {tone ? <span className={`report-status report-status-${tone}`}>{children}</span> : children}
              </td>
            );
          },
          tr: ({ node, ...props }) => <tr className="even:bg-[#EFF5FA]" {...props} />,
          ul: ({ node, ...props }) => <ul className="my-3 list-disc space-y-2 pl-6 marker:text-[#06C1A0]" {...props} />,
          ol: ({ node, ...props }) => <ol className="my-3 list-decimal space-y-2 pl-6 marker:font-semibold marker:text-[#122945]" {...props} />,
          li: ({ node, ...props }) => <li className="pl-1 leading-6" {...props} />,
          p: ({ node, ...props }) => <p className="leading-7" {...props} />,
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

  const rows = bulletLines
    .map((line) => {
      const matches = Array.from(line.matchAll(linkRe));
      if (matches.length === 0) return null;
      const namePart = cleanReportDisplayText(line.replace(/^-+\s*/, "").split(":")[0]);
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
      {type === "shopping" && (
        <div className="mb-4 rounded-xl border border-[#9DCFC3] bg-[#E6F7F3] px-4 py-3 text-sm leading-6 text-[#173B43]">
          <strong>Affiliate disclosure:</strong> {AFFILIATE_DISCLOSURE_NEAR_LINKS}
        </div>
      )}
      <table className="my-2 w-full border-collapse overflow-hidden text-sm">
        <thead className="bg-[#122945] text-white">
          <tr>
            <th className="px-3 py-0.5 text-left">Item</th>
            <th className="px-3 py-0.5 text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[#D1DBE0] even:bg-[#EFF5FA]">
              <td className="px-3 py-2">{r.name}</td>
              <td className="space-x-2 px-3 py-2">
                {r.links.map((link, j) => (
                  <CTAButton
                    key={j}
                    href={link.url}
                    variant={type === "shopping" ? "primary" : "secondary"}
                    size="sm"
                    className="report-link-action px-2 py-0.5 text-xs min-w-0"
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
        <div className="report-add-all mt-3">
          <CTAButton href={allCartUrl} variant="premium" size="md" className="px-4 py-2 text-sm">
            🛒 Add All to Cart
          </CTAButton>
        </div>
      )}

    </div>
  );
}

/* Section card wrapper */
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const displayTitle = reportSectionTitle(title);
  return (
    <section className="report-section mb-8 overflow-hidden rounded-2xl border border-[#D1DBE0] bg-white shadow-sm">
      <div className={title.includes("Contraindications") ? "border-b border-amber-200 bg-amber-50 px-6 py-4" : "bg-gradient-to-r from-[#041B2D] to-[#0B4B57] px-6 py-4"}>
        <h2 className={title.includes("Contraindications") ? "text-xl font-semibold text-amber-900" : "text-xl font-semibold text-white"}>{displayTitle}</h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
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
  const [exporting, setExporting] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [handoffActionId, setHandoffActionId] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
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
 const isGenerate = path.includes("/api/generate-stack");
const res = await fetchWithRetry(path, init, isGenerate ? 1 : 3, 500, isGenerate ? 150000 : 15000);


  // Try to read JSON; if it fails, surface status
  let json: any = {};
  try { json = await res.json(); } catch {}

if (!res.ok || json?.ok === false) {
  const msg = json?.error
    ? String(json.error)
    : (res.status !== 200 ? `HTTP ${res.status}` : "Temporary issue, please retry.");
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
// --- success detector + short polling (client-only) ---
const SECTION_HEADINGS = [
  "Intro Summary","Summary","Goals","Contraindications","Contraindications & Med Interactions",
  "Current Stack","Your Blueprint Recommendations","High-Impact \"Bang-for-Buck\" Additions",
  "Dosing & Notes","Dosing","Evidence & References","Shopping Links",
  "Follow-up Plan","Lifestyle Prescriptions","Longevity Levers","This Week Try","Weekly Experiment",
];

function hasUsableSections(md: string | null | undefined): boolean {
  if (!md) return false;
  const t = md.toLowerCase();
  if (!t.includes("## ")) return false; // has at least one heading
  return SECTION_HEADINGS.some(h => t.includes(("## " + h).toLowerCase()));
}

async function refetchUntilReady(qp: string, maxMs = 120_000): Promise<string> {
  const deadline = Date.now() + maxMs;
  let last = "";
  while (Date.now() < deadline) {
    const refreshed = await api(`/api/get-stack?${qp}`);
    const md = sanitizeMarkdown(
      refreshed?.stack?.sections?.markdown ?? refreshed?.stack?.summary ?? ""
    );
    last = md;
    if (hasUsableSections(md)) return md;
    await new Promise(r => setTimeout(r, 1500)); // poll every 1.5s
  }
  return last; // may still be empty if backend soft-failed
}

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
    const payload: { tally_submission_id?: string; submission_id?: string; generation_source: string } = tallyId
      ? { tally_submission_id: tallyId as string, generation_source: "results-page" }
      : { submission_id: anyId as string, generation_source: "results-page" };

    const data = await api("/api/generate-stack", payload);
    setStackId(
      data?.stack?.id ?? data?.stack?.raw?.stack_id ?? data?.ai?.raw?.stack_id ?? null
    );

    // Show something immediately if we have it
    const first =
      data?.ai?.markdown ??
      data?.stack?.sections?.markdown ??
      data?.stack?.summary ??
      "";
    if (first) setMarkdown(sanitizeMarkdown(first));

    // Build the correct query once
    const qp = tallyId
      ? `tally_submission_id=${encodeURIComponent(tallyId as string)}`
      : `submission_id=${encodeURIComponent(anyId as string)}`;

    // Poll for a few seconds until real sections land
    const finalMd = await refetchUntilReady(qp, 120_000);
    setMarkdown(sanitizeMarkdown(finalMd));

    // Try to capture a stack id (from the refetch)
    try {
      const latest = await api(`/api/get-stack?${qp}`);
      setStackId(
        latest?.stack?.id ?? data?.stack?.id ?? data?.stack?.raw?.stack_id ?? data?.ai?.raw?.stack_id ?? null
      );
    } catch {}

    // Success only if we actually have content
    if (hasUsableSections(finalMd)) {
      setFlow("done");
    } else {
      setError("Generation finished without full sections (likely a timeout). Please try again.");
      setFlow("error");
    }
  } catch (e: any) {
    setError(e?.message ?? "Unknown error");
    setFlow("error");
  } finally {
    setGenerating(false);
    setWarmingUp(false);
  }
}



async function exportPDF() {
  try {
    setPdfError(null);
    setExporting(true);
    if (!stackId || !hasUsableSections(markdown)) throw new Error("Generate the report before exporting a PDF.");
    const qp = tallyId
      ? `tally_submission_id=${encodeURIComponent(tallyId)}`
      : (submissionId ? `submission_id=${encodeURIComponent(submissionId)}` : "");
    if (!qp) throw new Error("Missing submission ID.");
    window.open(`/api/export-pdf?${qp}`, "_blank", "noopener,noreferrer");
    window.setTimeout(() => setExporting(false), 1500);
  } catch (e: any) {
    setPdfError(e.message ?? "PDF export failed. Please try again.");
    setExporting(false);
  }
}


  const sec = useMemo(() => {
    const report = parseBlueprintReport(markdown ?? "");
    return {
      intro: report.sections["Intro Summary"], goals: report.sections.Goals,
      contra: report.sections["Contraindications & Med Interactions"], current: report.sections["Current Stack"],
      blueprint: report.sections["Your Blueprint Recommendations"], dosing: report.sections["Dosing & Notes"],
      evidence: report.sections["Evidence & References"], shopping: report.sections["Shopping Links"],
      follow: report.sections["Follow-up Plan"], lifestyle: report.sections["Lifestyle Prescriptions"],
      longevity: report.sections["Longevity Levers"], weekTry: report.sections["This Week Try"],
      focusItems: report.focusItems,
      focusActions: buildBlueprintActionCandidates(report),
      contentHash: report.contentHash,
    };
  }, [markdown]);

  async function buildFirstWeek(actionId: string) {
    if (!stackId) {
      setHandoffError("Generate your Blueprint before choosing a first-week action.");
      return;
    }
    setHandoffActionId(actionId);
    setHandoffError(null);
    try {
      const response = await fetch("/api/blueprint-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stack_id: stackId, action_id: actionId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error === "action_requires_review"
          ? "This item needs professional review and cannot become an automatic habit."
          : "We could not save that action. Please try again.");
      }
      window.location.assign("/upgrade");
    } catch (error) {
      setHandoffError(error instanceof Error ? error.message : "We could not save that action. Please try again.");
      setHandoffActionId(null);
    }
  }

  return (
    <motion.main
      data-report-hash={sec.contentHash}
      className="report-page relative isolate min-h-screen overflow-hidden bg-gradient-to-br from-[#EFF5FA] via-white to-[#E6F7F3]"
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
        className="pointer-events-none absolute top-[20rem] -right-24 h-[28rem] w-[28rem] rounded-full bg-[#D9F4EE] opacity-35 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />

      {/* Content */}
      <div className="report-surface relative z-10 mx-auto max-w-6xl px-6 py-20">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-extrabold tracking-tight text-[#122945] sm:text-6xl">
            Your LVE360 Blueprint
          </h1>
          <div className="mx-auto mt-3 h-1 w-24 rounded-full bg-[#06C1A0]" />
          <p className="text-gray-600 mt-4 text-lg">Personalized insights for Longevity • Vitality • Energy</p>
          <p className="mt-2 text-gray-500 text-sm">$15/month Premium Access</p>
        </div>

        {/* two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT */}
          <div className="report-content lg:col-span-8">
            {/* actions */}
            <div className="report-no-print"><SectionCard title="Actions">
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
            </SectionCard></div>

            {error && <div className="text-center text-red-600 mb-6">{error}</div>}

            {!warmingUp && !generating && flow !== "error" && Boolean(markdown) && Boolean(stackId) && sec.focusActions.length > 0 && (
              <div className="report-focus mb-8 rounded-2xl border border-[#9DCFC3] bg-gradient-to-r from-[#EFF5FA] to-[#E6F7F3] p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#122945]">This Week Focus</p>
                <p className="mt-2 text-sm text-slate-600">Choose one lifestyle action to carry into your first week. Supplement and medication changes stay in the Blueprint for review.</p>
                <ol className="mt-4 grid gap-3 text-sm text-slate-800 sm:grid-cols-2">
                  {sec.focusActions.map((action, index) => (
                    <li key={action.id} className="flex flex-col rounded-xl bg-white/90 px-4 py-4 shadow-sm">
                      <p className="leading-6"><strong>{index + 1}.</strong> {action.label}</p>
                      {action.kind === "lifestyle" ? (
                        <button
                          type="button"
                          onClick={() => buildFirstWeek(action.id)}
                          disabled={handoffActionId !== null || !stackId}
                          className="mt-auto pt-4 text-left text-sm font-bold text-[#087F72] hover:text-[#05675D] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {handoffActionId === action.id ? "Saving your choice..." : "Build my first week"}
                        </button>
                      ) : (
                        <p className="mt-auto pt-4 text-xs font-semibold uppercase tracking-wide text-amber-700">Keep in Blueprint for review</p>
                      )}
                    </li>
                  ))}
                </ol>
                {handoffError && <p className="mt-3 text-sm font-medium text-red-700">{handoffError}</p>}
              </div>
            )}

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
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                  <strong>Safety review:</strong> Only material cautions are highlighted below. Items without a specific flag are omitted.
                </div>
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
            {sec.weekTry && sec.focusItems.length === 0 && (
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
              <p className="mt-4 border-t border-slate-200 pt-4 text-sm leading-relaxed text-gray-700">
                <strong>Affiliate disclosure:</strong> {AFFILIATE_DISCLOSURE_NEAR_LINKS} {AFFILIATE_DISCLOSURE_SUPPORT}
              </p>
            </SectionCard>

            {/* export PDF */}
            <div className="report-no-print mt-8 flex justify-center">
              <button
                onClick={exportPDF}
                disabled={exporting || generating || warmingUp || !stackId || !hasUsableSections(markdown)}
                aria-label="Export PDF"
                className="min-w-24 h-10 px-3 flex items-center justify-center rounded-md border border-gray-300 bg-white shadow-sm hover:shadow-md transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting ? "Opening PDF..." : "Export PDF"}
              </button>
            </div>
            {pdfError && <p className="mt-2 text-center text-sm text-red-600">{pdfError}</p>}
          </div>

          {/* RIGHT: sticky sidebar */}
          <div className="report-sidebar lg:col-span-4">
            {stackId ? (
              <ResultsSidebar stackId={stackId} />
            ) : (
              <div className="rounded-xl border p-4 text-sm text-gray-600">
                {generating || warmingUp
                  ? "Stack items will appear when generation finishes."
                  : "Stack items are unavailable for this report. Generate or reload the report to try again."}
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

