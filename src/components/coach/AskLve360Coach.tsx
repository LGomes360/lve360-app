"use client";

import { ExternalLink, MessageCircle, Send, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  coachPageFromPath,
  coachSuggestedPrompts,
  type CoachFeedback,
  type CoachTurn,
} from "@/lib/contextualCoach";

type Usage = {
  turns: number;
  estimatedCostUsd: number;
  limit: { monthlyTurns: number; monthlyCostUsd: number };
};

export default function AskLve360Coach() {
  const pathname = usePathname() ?? "/today";
  const page = coachPageFromPath(pathname);
  const prompts = useMemo(() => coachSuggestedPrompts(page), [page]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || loaded) return;
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/coach", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "coach_unavailable");
        setTurns(payload.turns ?? []);
        setUsage(payload.usage ?? null);
        setLoaded(true);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError("Ask LVE360 is temporarily unavailable. Please try again.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [loaded, open]);

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    const value = question.replace(/\s+/g, " ").trim();
    if (value.length < 4 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value, pathname }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "coach_unavailable");
      setTurns((current) => [payload.turn as CoachTurn, ...current].slice(0, 8));
      setUsage(payload.usage ?? null);
      setQuestion("");
    } catch {
      setError("I could not answer that right now. Your saved information was not changed.");
    } finally {
      setLoading(false);
    }
  }

  async function leaveFeedback(id: string, feedback: CoachFeedback) {
    setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, feedback } : turn));
    const response = await fetch("/api/coach", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, feedback }),
    });
    if (!response.ok) {
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, feedback: null } : turn));
      setError("That feedback did not save. Please try again.");
    }
  }

  const remaining = usage ? Math.max(0, usage.limit.monthlyTurns - usage.turns) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#087F72]/30 bg-[#EAFBF8] px-3 py-2 text-sm font-bold text-[#06695F] transition hover:border-[#087F72] hover:bg-[#DDF7F1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
        aria-haspopup="dialog"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span className="hidden lg:inline">Ask LVE360</span>
        <span className="sr-only lg:hidden">Ask LVE360</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex justify-end bg-[#041B2D]/35" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false);
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-title"
            className="flex h-full w-full max-w-xl flex-col bg-[#F8FCFB] shadow-2xl"
          >
            <header className="border-b border-[#9DCFC3] bg-white px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Contextual coaching</p>
                  <h2 id="coach-title" className="mt-1 text-2xl font-black text-[#041B2D]">Ask LVE360</h2>
                  <p className="mt-1 text-sm text-[#486170]">Grounded in the records you have saved in LVE360.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-[#486170] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]" aria-label="Close Ask LVE360">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {remaining !== null ? <p className="mt-3 text-xs font-semibold text-[#486170]">{remaining} coaching question{remaining === 1 ? "" : "s"} remaining this month</p> : null}
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {!turns.length && !loading ? (
                <div className="rounded-2xl border border-[#9DCFC3] bg-white p-5">
                  <h3 className="font-black text-[#041B2D]">Start with what is in front of you</h3>
                  <p className="mt-2 text-sm leading-6 text-[#486170]">Ask about a Blueprint theme, your weekly practice, recorded progress, or how to prepare a question for a clinician.</p>
                  <div className="mt-4 space-y-2">
                    {prompts.map((prompt) => (
                      <button key={prompt} type="button" onClick={() => setQuestion(prompt)} className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-[#041B2D] hover:border-[#087F72] hover:bg-[#EAFBF8]">
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-5" aria-live="polite">
                {loading && !turns.length ? <p className="text-sm text-[#486170]">Loading your coaching history…</p> : null}
                {turns.map((turn) => (
                  <article key={turn.id} className="space-y-3">
                    <div className="ml-8 rounded-2xl rounded-br-md bg-[#041B2D] px-4 py-3 text-sm leading-6 text-white">{turn.question}</div>
                    <div className="mr-4 rounded-2xl rounded-bl-md border border-[#9DCFC3] bg-white p-4 shadow-sm">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[#17384A]">{turn.answer}</p>
                      {turn.source_refs?.length ? (
                        <details className="mt-4 border-t border-slate-100 pt-3">
                          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">What I used</summary>
                          <ul className="mt-3 space-y-2">
                            {turn.source_refs.map((source) => (
                              <li key={source.id} className="rounded-xl bg-[#F3F8F7] p-3 text-xs leading-5 text-[#486170]">
                                <Link href={source.href} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 font-bold text-[#06695F] hover:underline">
                                  {source.label}<ExternalLink className="h-3 w-3" aria-hidden="true" />
                                </Link>
                                <p>{source.summary}</p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-[#486170]">
                        <span>Was this useful?</span>
                        <button type="button" onClick={() => leaveFeedback(turn.id, "useful")} aria-label="Mark answer useful" aria-pressed={turn.feedback === "useful"} className={`rounded-md p-1.5 ${turn.feedback === "useful" ? "bg-[#DDF7F1] text-[#06695F]" : "hover:bg-slate-100"}`}><ThumbsUp className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" onClick={() => leaveFeedback(turn.id, "not_useful")} aria-label="Mark answer not useful" aria-pressed={turn.feedback === "not_useful"} className={`rounded-md p-1.5 ${turn.feedback === "not_useful" ? "bg-amber-100 text-amber-800" : "hover:bg-slate-100"}`}><ThumbsDown className="h-4 w-4" aria-hidden="true" /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
            </div>

            <footer className="border-t border-[#9DCFC3] bg-white p-4 sm:px-6">
              <form onSubmit={ask} className="flex gap-2">
                <label htmlFor="coach-question" className="sr-only">Ask LVE360 a question</label>
                <textarea
                  id="coach-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value.slice(0, 500))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void ask();
                    }
                  }}
                  rows={2}
                  placeholder="Ask about your next small step…"
                  className="min-h-12 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-[#041B2D] focus:border-[#087F72] focus:outline-none focus:ring-2 focus:ring-[#087F72]/20"
                  disabled={loading || remaining === 0}
                />
                <button type="submit" disabled={loading || question.trim().length < 4 || remaining === 0} className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#087F72] text-white hover:bg-[#06695F] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send question">
                  <Send className="h-5 w-5" aria-hidden="true" />
                </button>
              </form>
              <p className="mt-2 text-xs leading-5 text-[#60798A]">Educational wellness support only. Ask LVE360 cannot diagnose or change medications, hormones, supplements, reminders, or saved records. Review health decisions with a qualified professional.</p>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
