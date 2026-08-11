"use client";

import { ArrowRight, Check, Clock3, Loader2, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { localDateString } from "@/lib/regimenSchedule";
import type { TodayBriefPrimaryAction } from "@/lib/todayBrief";

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
};

export default function AiTodayBrief({
  date,
  onPracticeCompleted,
}: {
  date?: string | null;
  onPracticeCompleted?: () => void;
}) {
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

  async function recordAction(action: "useful" | "not_useful" | "remind_later" | "opened_routine" | "completed") {
    if (!brief) return false;
    const response = await fetch("/api/today-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefId: brief.id, action }),
      keepalive: action === "opened_routine",
    });
    return response.ok;
  }

  async function markPracticeComplete() {
    if (!brief) return;
    setBusy("complete");
    setError(null);
    try {
      const response = await fetch("/api/today", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: localDate, kind: "full" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error("completion_failed");
      await recordAction("completed");
      onPracticeCompleted?.();
      await load();
    } catch {
      setError("We could not record that action. Your progress is unchanged.");
    } finally {
      setBusy(null);
    }
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
      <section className="rounded-3xl border border-[#BCE3DA] bg-white p-5 shadow-sm" aria-label="Preparing your daily brief">
        <p className="flex items-center text-sm font-semibold text-slate-600">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#087F72]" aria-hidden="true" /> Preparing one useful next step
        </p>
      </section>
    );
  }
  if (!brief || brief.hidden) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-[#8CCFC1] bg-white shadow-sm" aria-labelledby="ai-today-brief-title">
      <div className="grid gap-5 bg-gradient-to-br from-[#EAFBF8] via-white to-[#F4EEFF] p-5 sm:p-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div>
          <p className="flex items-center text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">
            <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" /> Your daily brief
          </p>
          <h2 id="ai-today-brief-title" className="mt-2 text-2xl font-bold leading-tight text-[#041B2D]">{brief.noticed}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{brief.whyItMatters}</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">Best next move</p>
          <p className="mt-2 font-bold leading-6 text-[#041B2D]">{brief.nextAction}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">If today gets hard</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">{brief.minimumVersion}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-[#D8EEE9] px-5 py-4 sm:px-6">
        {error ? <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {brief.primaryAction === "mark_complete" ? (
            <button type="button" onClick={() => void markPracticeComplete()} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 text-sm font-bold text-white hover:bg-[#06695F] disabled:opacity-60">
              {busy === "complete" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />} Mark complete
            </button>
          ) : brief.primaryHref ? (
            <Link href={brief.primaryHref} className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 text-sm font-bold text-white hover:bg-[#06695F]">
              {brief.primaryAction === "open_review" ? "Open weekly review" : brief.primaryAction === "open_blueprint" ? "Open current Blueprint" : "Choose my practice"}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
          <Link href="/routine" onClick={() => void recordAction("opened_routine")} className="inline-flex min-h-11 items-center rounded-xl border border-[#9DCFC3] px-4 py-2 text-sm font-bold text-[#06695F] hover:bg-[#F4FAF8]">
            Open Routine
          </Link>
          <button type="button" onClick={() => void handleQuietAction("remind_later")} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center px-3 py-2 text-sm font-semibold text-slate-600 hover:text-[#041B2D] disabled:opacity-60">
            <Clock3 className="mr-2 h-4 w-4" aria-hidden="true" /> Remind later
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-xs leading-5 text-slate-500">
            {brief.source === "ai" ? "Personalized from your current week." : "Based on your saved plan while AI coaching is unavailable."} Educational wellness support only.
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
    </section>
  );
}
