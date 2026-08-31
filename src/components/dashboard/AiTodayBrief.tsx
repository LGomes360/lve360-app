"use client";

import { ArrowRight, Clock3, Loader2, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { localDateString } from "@/lib/regimenSchedule";
import type { TodayBriefPrimaryAction, TodayRecommendationGrounding } from "@/lib/todayBrief";

type Brief = {
  id: string;
  localDate: string;
  source: "ai" | "fallback";
  noticed: string;
  whyItMatters: string;
  nextAction: string;
  minimumVersion: string;
  primaryAction: TodayBriefPrimaryAction;
  primaryHref: string | null;
  feedback: "useful" | "not_useful" | null;
  actionState: "none" | "completed" | "remind_later" | "opened_routine" | "dismissed";
  hidden: boolean;
  grounding: {
    confidence: "direct_record" | "limited_context";
    confidenceLabel: "Direct record match" | "Limited personal context";
    sourceLabel: string;
  };
  groundingDetails?: TodayRecommendationGrounding;
};

export default function AiTodayBrief({ date }: { date?: string | null }) {
  const localDate = date ?? localDateString();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/today-brief?date=${encodeURIComponent(localDate)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error("brief_unavailable");
      setBrief(body.brief);
    } catch {
      // Today remains useful without AI. Do not turn a coaching outage into a blocking alert.
      setBrief(null);
    } finally {
      setLoading(false);
    }
  }, [localDate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recordAction(action: "useful" | "not_useful" | "remind_later") {
    if (!brief) return false;
    const response = await fetch("/api/today-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefId: brief.id, action }),
    });
    return response.ok;
  }

  async function handleQuietAction(action: "useful" | "not_useful" | "remind_later") {
    if (!brief) return;
    setBusy(action);
    setError(null);
    try {
      if (!await recordAction(action)) throw new Error("brief_action_failed");
      if (action === "useful") setBrief({ ...brief, feedback: "useful" });
      else setBrief(null);
    } catch {
      setError("We could not save that preference. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-[#BCE3DA] bg-[#F4FAF8] p-4" aria-label="Preparing your daily brief">
        <p className="flex items-center text-sm font-semibold text-slate-600">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#087F72]" aria-hidden="true" /> Preparing one useful next step
        </p>
      </section>
    );
  }
  if (!brief || brief.hidden) return null;

  return (
    <details className="group rounded-2xl border border-[#BCE3DA] bg-gradient-to-br from-[#EAFBF8] via-white to-[#F4EEFF]">
      <summary className="flex min-h-14 cursor-pointer list-none flex-col items-start gap-2 px-4 py-4 marker:content-none sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
        <span className="min-w-0">
          <span className="flex items-center text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">
            <Sparkles className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" /> Insight for today
          </span>
          <span className="mt-1 block truncate text-sm font-bold text-[#041B2D]">{brief.noticed}</span>
        </span>
        <span className="shrink-0 text-sm font-bold text-[#06695F]">
          <span className="group-open:hidden sm:hidden">Open reasoning</span>
          <span className="hidden group-open:hidden sm:inline">Open reasoning and sources</span>
          <span className="hidden group-open:inline">Hide reasoning</span>
        </span>
      </summary>

      <div className="border-t border-[#D8EEE9] p-5 sm:p-6">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">What LVE360 noticed</p>
          <h2 id="ai-today-brief-title" className="mt-1 text-xl font-bold leading-tight text-[#041B2D] sm:text-2xl">{brief.noticed}</h2>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">Why this matters today</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{brief.whyItMatters}</p>
          {brief.groundingDetails ? <TodayGroundingCard grounding={brief.groundingDetails} /> : (
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600" aria-label="Decision confidence and source">
              <span className={`rounded-full px-3 py-1.5 ${brief.grounding.confidence === "direct_record" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                Confidence: {brief.grounding.confidenceLabel}
              </span>
              <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">Source: {brief.grounding.sourceLabel}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-4 border-t border-[#D8EEE9] pt-4">
        {error ? <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {brief.primaryAction !== "mark_complete" && brief.primaryHref ? (
            <Link href={brief.primaryHref} className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 text-sm font-bold text-white hover:bg-[#06695F]">
              {brief.primaryAction === "open_review" ? "Open weekly review" : brief.primaryAction === "open_blueprint" ? "Open current Blueprint" : "Choose my practice"}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
          <button type="button" onClick={() => void handleQuietAction("remind_later")} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center px-3 py-2 text-sm font-semibold text-slate-600 hover:text-[#041B2D] disabled:opacity-60">
            <Clock3 className="mr-2 h-4 w-4" aria-hidden="true" /> Hide for 3 hours
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-xs leading-5 text-slate-500">
            {brief.source === "ai" ? "Personalized from your current week." : "Based on your saved plan."} Educational wellness support only.
          </p>
          <div className="flex items-center gap-1" aria-label="Rate this brief">
            <span className="mr-1 text-xs text-slate-500">Useful?</span>
            <button type="button" title="Useful" aria-label="This brief was useful" onClick={() => void handleQuietAction("useful")} disabled={Boolean(busy)} className={`rounded-lg p-2 ${brief.feedback === "useful" ? "bg-emerald-100 text-emerald-800" : "text-slate-500 hover:bg-slate-100"}`}>
              <ThumbsUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" title="Not useful" aria-label="This brief was not useful" onClick={() => void handleQuietAction("not_useful")} disabled={Boolean(busy)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <ThumbsDown className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      </div>
    </details>
  );
}

function TodayGroundingCard({ grounding }: { grounding: TodayRecommendationGrounding }) {
  return (
    <aside className="mt-4 rounded-2xl border border-[#CFE8E2] bg-white/85 p-4" aria-label="Grounding for today’s recommendation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">{grounding.title}</p>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${grounding.confidence === "direct_record" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
          {grounding.confidenceLabel}
        </span>
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{grounding.summary}</p>
      {grounding.sources.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {grounding.sources.map((source, index) => (
            <Link
              key={`${source.kind}-${index}`}
              href={source.href}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-[#9DCFC3] hover:bg-[#F4FAF8]"
            >
              <span className="flex items-center justify-between gap-2 text-sm font-bold text-[#06695F]">
                {source.label}
                <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">{source.detail}</span>
              {source.status && source.status !== "current" ? (
                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${source.status === "needs_review" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                  {source.status === "needs_review" ? "Needs review" : "Historical connection"}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-slate-500">{grounding.methodNote}</p>
    </aside>
  );
}
