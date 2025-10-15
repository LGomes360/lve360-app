"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type StackItem = {
  id?: string;
  name: string;
  dose: string | null;
  timing: string | null; // "AM" | "PM" | "AM/PM" | null
  notes?: string | null;
  rationale?: string | null;
  caution?: string | null;
  citations?: string[] | null;
  link_amazon?: string | null;
  link_fullscript?: string | null;
  link_thorne?: string | null;
  link_other?: string | null;
};

type GetStackResp = {
  ok: boolean;
  found?: boolean;
  stack?: {
    id: string;
    submission_id: string;
    tally_submission_id?: string | null;
    summary?: string | null;
    sections?: { markdown?: string } | null;
    safety_status?: "safe" | "warning" | "error" | null;
    safety_warnings?: any[] | null;
    total_monthly_cost?: number | null;
    updated_at?: string | null;
  } | null;
};

type GenerateResp = {
  ok?: boolean;
  trace_id?: string;
  steps?: string[];
  generation_status?: "ai" | "ai_with_warnings";
  ai?: {
    markdown: string | null;
    model_used: string | null;
    validation?: { ok?: boolean } | null;
  } | null;
  stack?: any;
  items?: Array<{ id: string; stack_id: string; name: string; timing: string | null; dose: string | null }>;
};

function byTiming(items: StackItem[]) {
  const am: StackItem[] = [];
  const pm: StackItem[] = [];
  const any: StackItem[] = [];
  for (const it of items) {
    const t = (it.timing || "").toUpperCase();
    if (t === "AM") am.push(it);
    else if (t === "PM") pm.push(it);
    else if (t === "AM/PM") { am.push(it); pm.push(it); }
    else any.push(it);
  }
  return { am, pm, any };
}

function prettyDose(it: StackItem) {
  if (!it.dose && !it.notes) return "";
  if (it.dose && it.notes) return `${it.dose} — ${it.notes}`;
  return it.dose ?? it.notes ?? "";
}

export default function ResultsPage() {
  const search = useSearchParams();
  const submissionParam = search.get("submission_id") ?? undefined;
  const tallyParam = search.get("tally_submission_id") ?? undefined;

  const idForApi = submissionParam ?? tallyParam ?? ""; // either is fine; our APIs resolve the short id when needed

  const [loading, setLoading] = useState(false);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [items, setItems] = useState<StackItem[]>([]);
  const [pdfHref, setPdfHref] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "ready" | "warn" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const fetchStack = useCallback(async () => {
    if (!idForApi) return;
    try {
      // get stack + sections + items (items come from a separate query in your GET-STACK route)
      const res = await fetch(`/api/get-stack?submission_id=${encodeURIComponent(idForApi)}`, { cache: "no-store" });
      const json: any = await res.json();

      if (!json?.ok) throw new Error("Failed to load stack");

      const md =
        json?.stack?.sections?.markdown ??
        json?.stack?.summary ??
        "";

      setMarkdown(md || "");
      setItems(Array.isArray(json?.stack?.items) ? json.stack.items : Array.isArray(json?.items) ? json.items : []);
      setStatus(json?.stack?.safety_status === "error" ? "warn" : "ready");
      setPdfHref(`/api/export-pdf?submission_id=${encodeURIComponent(idForApi)}`);
    } catch (e: any) {
      console.error("fetchStack error:", e?.message || e);
      setStatus("error");
      setMessage("We couldn’t load your report yet. Try Generate again.");
    }
  }, [idForApi]);

  const onGenerate = useCallback(async () => {
    if (!idForApi) {
      setMessage("Missing submission identifier.");
      return;
    }
    setLoading(true);
    setMessage("");
    setStatus("idle");
    try {
      const res = await fetch(`/api/generate-stack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          submissionParam
            ? { submission_id: submissionParam }
            : { tally_submission_id: tallyParam }
        ),
      });
      const json: GenerateResp = await res.json();

      // We no longer hard-fail on non-OK; generator is fail-safe.
      setTraceId(json?.trace_id ?? null);

      // Prefer freshly returned markdown if present
      const md = json?.ai?.markdown ?? json?.stack?.sections?.markdown ?? "";
      if (md) setMarkdown(md);

      // Items might be returned directly or fetched after persist
      if (Array.isArray(json?.items) && json.items.length) {
        setItems(
          json.items.map((r: any) => ({
            id: r.id,
            name: r.name,
            dose: r.dose ?? null,
            timing: r.timing ?? null,
          }))
        );
      } else {
        // fallback: pull via GET so we have persisted rows
        await fetchStack();
      }

      const okish = json?.generation_status ? json.generation_status !== "error" : true;
      setStatus(okish ? (json?.generation_status === "ai_with_warnings" ? "warn" : "ready") : "warn");
      setPdfHref(`/api/export-pdf?submission_id=${encodeURIComponent(idForApi)}`);
    } catch (e: any) {
      console.error("generate error:", e?.message || e);
      setStatus("warn");
      setMessage("Report generated with warnings. Content may be partial.");
      // still try to render whatever we have on disk
      await fetchStack();
    } finally {
      setLoading(false);
    }
  }, [fetchStack, idForApi, submissionParam, tallyParam]);

  useEffect(() => { fetchStack(); }, [fetchStack]);

  const grouped = useMemo(() => byTiming(items), [items]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-800">
          Your <span className="text-teal-600">LVE360</span> Blueprint
        </h1>
        <p className="mt-2 text-slate-600">Personalized insights for Longevity • Vitality • Energy</p>
      </header>

      <section className="mb-6 rounded-2xl bg-white/70 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onGenerate}
              disabled={loading || !idForApi}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {loading ? "Generating…" : "✨ Generate Free Report"}
            </button>
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-white hover:opacity-90"
            >
              Upgrade to Premium
            </a>
            <a
              href={pdfHref || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={(e) => { if (!pdfHref) e.preventDefault(); }}
            >
              ⬇️ Download PDF
            </a>
          </div>

          {/* subtle status, no scary banners */}
          <div className="text-sm text-slate-500">
            {status === "ready" && "Ready"}
            {status === "warn" && "Generated with warnings"}
            {status === "error" && "Couldn’t load yet"}
            {traceId ? <span className="ml-2 opacity-70">Trace: {traceId}</span> : null}
          </div>
        </div>
        {message ? (
          <div className="px-4 pb-3 text-sm text-amber-700">{message}</div>
        ) : null}
      </section>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Markdown content */}
        <article className="lg:col-span-8 rounded-2xl bg-white/70 p-5 shadow-sm ring-1 ring-slate-100">
          {markdown ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className="prose prose-slate max-w-none prose-h2:mt-8 prose-h2:text-slate-800 prose-table:overflow-hidden"
              components={{
                table: ({ node, ...props }) => (
                  <div className="overflow-x-auto">
                    <table {...props} />
                  </div>
                ),
              }}
            >
              {markdown}
            </ReactMarkdown>
          ) : (
            <p className="text-slate-500">No report yet. Click “Generate Free Report”.</p>
          )}
        </article>

        {/* Sidebar: AM / PM schedule */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl bg-white/70 p-5 shadow-sm ring-1 ring-slate-100">
            <h3 className="mb-3 text-lg font-semibold text-slate-800">Dosing Schedule</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 font-semibold text-slate-700">AM</div>
                  {grouped.am.length ? (
                    <ul className="space-y-1 text-sm">
                      {grouped.am.map((it, i) => (
                        <li key={`am-${i}`} className="flex justify-between gap-3">
                          <span className="text-slate-800">{it.name}</span>
                          <span className="text-slate-500">{prettyDose(it)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-slate-400">None</div>
                  )}
                </div>
              </div>

              <div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 font-semibold text-slate-700">PM</div>
                  {grouped.pm.length ? (
                    <ul className="space-y-1 text-sm">
                      {grouped.pm.map((it, i) => (
                        <li key={`pm-${i}`} className="flex justify-between gap-3">
                          <span className="text-slate-800">{it.name}</span>
                          <span className="text-slate-500">{prettyDose(it)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-slate-400">None</div>
                  )}
                </div>
              </div>
            </div>

            {grouped.any.length ? (
              <div className="mt-4 rounded-xl border border-slate-200 p-3">
                <div className="mb-2 font-semibold text-slate-700">Any time</div>
                <ul className="space-y-1 text-sm">
                  {grouped.any.map((it, i) => (
                    <li key={`any-${i}`} className="flex justify-between gap-3">
                      <span className="text-slate-800">{it.name}</span>
                      <span className="text-slate-500">{prettyDose(it)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Safety summary card */}
          <div className="rounded-2xl bg-white/70 p-5 shadow-sm ring-1 ring-slate-100">
            <h3 className="mb-2 text-lg font-semibold text-slate-800">Safety</h3>
            <p className="text-sm text-slate-600">
              This plan is educational and not medical advice. If you take prescriptions or have conditions,
              discuss changes with your clinician.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
