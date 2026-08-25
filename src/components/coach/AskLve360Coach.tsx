"use client";

import { CalendarPlus, Check, ExternalLink, Loader2, MessageCircle, Send, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  coachPageFromPath,
  coachSuggestedPrompts,
  type CoachFeedback,
  type CoachTurn,
} from "@/lib/contextualCoach";
import { identityLabel } from "@/lib/activation";
import type { CoachActionProposal } from "@/lib/coachActions";

type Usage = {
  turns: number;
  estimatedCostUsd: number;
  limit: { monthlyTurns: number; monthlyCostUsd: number };
  allowance?: { baseTurns: number; bonusTurns: number; totalTurns: number };
  period?: { startAt: string; resetAt: string };
  remaining?: number;
  exhausted?: boolean;
  limitedBy?: "turns" | "cost" | null;
};

function resetDateLabel(resetAt: string | undefined) {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

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
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const launchButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const closeCoach = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => launchButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      transcriptRef.current?.scrollTo({ top: 0 });
      closeButtonRef.current?.focus();
    });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeCoach();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeCoach, open]);

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
      window.requestAnimationFrame(() => transcriptRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
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

  async function updateAction(proposalId: string, action: "confirm" | "cancel") {
    setActionBusyId(proposalId);
    setError(null);
    try {
      const response = await fetch("/api/coach/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: proposalId, action }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; proposal?: CoachActionProposal; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.proposal) throw new Error(payload?.error ?? "coach_action_unavailable");
      setTurns((current) => current.map((turn) => turn.action_proposal?.id === proposalId
        ? { ...turn, action_proposal: payload.proposal }
        : turn));
      setPreviewingId(null);
    } catch {
      setError(action === "confirm" ? "That practice was not saved. Please try again." : "That suggestion was not removed. Please try again.");
    } finally {
      setActionBusyId(null);
    }
  }

  const totalAllowance = usage?.allowance?.totalTurns ?? usage?.limit.monthlyTurns ?? null;
  const remaining = usage
    ? usage.remaining ?? Math.max(0, usage.limit.monthlyTurns - usage.turns)
    : null;
  const exhausted = usage?.exhausted ?? remaining === 0;
  const resetLabel = resetDateLabel(usage?.period?.resetAt);
  const bonusTurns = usage?.allowance?.bonusTurns ?? 0;

  return (
    <>
      <button
        ref={launchButtonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#087F72]/30 bg-[#EAFBF8] px-3 py-2 text-sm font-bold text-[#06695F] transition hover:border-[#087F72] hover:bg-[#DDF7F1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2"
        aria-haspopup="dialog"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span className="hidden lg:inline">Ask LVE360</span>
        <span className="sr-only lg:hidden">Ask LVE360</span>
      </button>

      {open ? createPortal((
        <div className="fixed inset-0 z-[80] flex items-stretch justify-end bg-[#041B2D]/45 sm:p-4 lg:p-6" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeCoach();
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-title"
            className="flex h-full w-full min-w-0 max-w-6xl flex-col overflow-hidden bg-[#F8FCFB] shadow-2xl sm:h-[calc(100dvh-2rem)] sm:w-[min(92vw,72rem)] sm:rounded-[1.75rem] lg:h-[calc(100dvh-3rem)]"
          >
            <header className="shrink-0 border-b border-[#9DCFC3] bg-white px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Contextual coaching</p>
                  <h2 id="coach-title" className="mt-1 text-2xl font-black text-[#041B2D]">Ask LVE360</h2>
                  <p className="mt-1 text-sm text-[#486170]">Personalized using your LVE360 health record, evidence library, and safety rules.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {remaining !== null && totalAllowance !== null ? (
                    <div className="hidden text-right sm:block">
                      <span className="inline-flex rounded-full bg-[#EAFBF8] px-3 py-1.5 text-xs font-bold text-[#06695F]">{remaining} of {totalAllowance} questions left</span>
                      {resetLabel ? <p className="mt-1 text-[11px] font-semibold text-[#60798A]">Resets {resetLabel}</p> : null}
                    </div>
                  ) : null}
                  <button ref={closeButtonRef} type="button" onClick={closeCoach} className="rounded-lg p-2 text-[#486170] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72]" aria-label="Close Ask LVE360">
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {remaining !== null && totalAllowance !== null ? (
                <p className="mt-2 text-xs font-semibold text-[#486170] sm:hidden">
                  {remaining} of {totalAllowance} coaching questions left{resetLabel ? ` · Resets ${resetLabel}` : ""}
                </p>
              ) : null}
              {bonusTurns > 0 ? <p className="mt-2 text-xs font-semibold text-[#087F72]">Includes {bonusTurns} approved testing question{bonusTurns === 1 ? "" : "s"} for this period.</p> : null}
            </header>

            <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
              <div className="mx-auto w-full max-w-5xl">
                {!turns.length && !loading ? (
                <div className="rounded-2xl border border-[#9DCFC3] bg-white p-5 sm:p-6">
                  <h3 className="font-black text-[#041B2D]">Start with what is in front of you</h3>
                  <p className="mt-2 text-sm leading-6 text-[#486170]">Ask about a Blueprint theme, your weekly practice, recorded progress, or how to prepare a question for a clinician.</p>
                  <div className="mt-4 grid gap-2 lg:grid-cols-2">
                    {prompts.map((prompt) => (
                      <button key={prompt} type="button" onClick={() => setQuestion(prompt)} className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-[#041B2D] hover:border-[#087F72] hover:bg-[#EAFBF8]">
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-6" aria-live="polite">
                {loading && !turns.length ? <p className="text-sm text-[#486170]">Loading your coaching history…</p> : null}
                {turns.map((turn) => (
                  <article key={turn.id} className="space-y-3">
                    <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-[#041B2D] px-4 py-3 text-sm leading-6 text-white sm:max-w-[78%]">{turn.question}</div>
                    <div className="mr-auto w-full rounded-2xl rounded-bl-md border border-[#9DCFC3] bg-white p-4 shadow-sm sm:p-5">
                      <p className="whitespace-pre-wrap text-[15px] leading-7 text-[#17384A]">{turn.answer}</p>
                      {turn.action_proposal ? (
                        <CoachActionCard
                          proposal={turn.action_proposal}
                          previewing={previewingId === turn.action_proposal.id}
                          busy={actionBusyId === turn.action_proposal.id}
                          onPreview={() => setPreviewingId(turn.action_proposal?.id ?? null)}
                          onConfirm={() => void updateAction(turn.action_proposal!.id, "confirm")}
                          onCancel={() => void updateAction(turn.action_proposal!.id, "cancel")}
                        />
                      ) : null}
                      {turn.source_refs?.length ? (
                        <details className="mt-4 border-t border-slate-100 pt-3">
                          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">What I used</summary>
                          <ul className="mt-3 space-y-2">
                            {turn.source_refs.map((source) => {
                              const external = /^https?:\/\//i.test(source.href);
                              return (
                                <li key={source.id} className="rounded-xl bg-[#F3F8F7] p-3 text-xs leading-5 text-[#486170]">
                                  <Link
                                    href={source.href}
                                    target={external ? "_blank" : undefined}
                                    rel={external ? "noopener noreferrer" : undefined}
                                    onClick={() => { if (!external) setOpen(false); }}
                                    className="inline-flex items-center gap-1 font-bold text-[#06695F] hover:underline"
                                  >
                                    {source.label}<ExternalLink className="h-3 w-3" aria-hidden="true" />
                                  </Link>
                                  <p>{source.summary}</p>
                                </li>
                              );
                            })}
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
            </div>

            <footer className="shrink-0 border-t border-[#9DCFC3] bg-white px-4 py-3 sm:px-6 lg:px-8">
              {exhausted ? (
                <div className="mx-auto w-full max-w-5xl rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                  <p className="font-black">You have used your Ask LVE360 questions for this period.</p>
                  <p className="mt-1 text-sm leading-6">{resetLabel ? `Questions become available again on ${resetLabel}. ` : ""}Your saved records and the rest of your membership remain available.</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold">
                    <Link href="/today" onClick={closeCoach} className="underline decoration-amber-400 underline-offset-4">Open Today</Link>
                    <Link href="/blueprints" onClick={closeCoach} className="underline decoration-amber-400 underline-offset-4">Review Blueprint</Link>
                    <Link href="/contact" onClick={closeCoach} className="underline decoration-amber-400 underline-offset-4">Contact support</Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={ask} className="mx-auto flex w-full max-w-5xl items-end gap-2">
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
                    className="min-h-12 max-h-32 flex-1 resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm text-[#041B2D] focus:border-[#087F72] focus:outline-none focus:ring-2 focus:ring-[#087F72]/20"
                    disabled={loading}
                  />
                  <button type="submit" disabled={loading || question.trim().length < 4} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#087F72] text-white hover:bg-[#06695F] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send question">
                    <Send className="h-5 w-5" aria-hidden="true" />
                  </button>
                </form>
              )}
              <p className="mx-auto mt-2 w-full max-w-5xl text-[11px] leading-4 text-[#60798A]">Educational wellness coaching. Ask LVE360 can explain and compare options, but it cannot diagnose or silently change saved records. Medication and hormone changes require qualified professional guidance.</p>
            </footer>
          </section>
        </div>
      ), document.body) : null}
    </>
  );
}

function CoachActionCard({
  proposal,
  previewing,
  busy,
  onPreview,
  onConfirm,
  onCancel,
}: {
  proposal: CoachActionProposal;
  previewing: boolean;
  busy: boolean;
  onPreview: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (proposal.status === "cancelled") {
    return <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-[#60798A]">Suggestion not saved. Your weekly practice is unchanged.</p>;
  }
  if (proposal.status === "applied") {
    return <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#EAFBF8] px-4 py-3 text-sm font-bold text-[#06695F]"><Check className="h-4 w-4" /> Added to your weekly practice</p>;
  }
  if (proposal.status === "confirmed") {
    return (
      <section className="mt-4 rounded-2xl border border-[#9DCFC3] bg-[#F4FAF8] p-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]"><Check className="h-4 w-4" /> Saved for your weekly review</p>
        <p className="mt-2 font-bold text-[#041B2D]">{proposal.actionLabel}</p>
        <p className="mt-1 text-sm leading-6 text-[#486170]">Nothing changes this week. You can use or edit this idea when you shape your next week.</p>
        <button type="button" onClick={onCancel} disabled={busy} className="mt-3 text-sm font-bold text-[#486170] underline decoration-slate-300 underline-offset-4 hover:text-[#041B2D] disabled:opacity-50">
          {busy ? "Removing..." : "Remove from weekly review"}
        </button>
      </section>
    );
  }
  if (!previewing) {
    return (
      <button type="button" onClick={onPreview} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[#087F72] bg-[#EAFBF8] px-4 py-2 text-sm font-bold text-[#06695F] hover:bg-[#DDF7F1]">
        <CalendarPlus className="mr-2 h-4 w-4" /> Preview as next week&apos;s practice
      </button>
    );
  }
  return (
    <section className="mt-4 rounded-2xl border-2 border-[#087F72] bg-[#F4FAF8] p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">Preview only</p>
      <h3 className="mt-2 text-lg font-black text-[#041B2D]">{proposal.actionLabel}</h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-bold text-[#486170]">Identity</dt><dd className="mt-1 text-[#041B2D]">{identityLabel(proposal.identityDirection)}</dd></div>
        <div><dt className="font-bold text-[#486170]">Cue</dt><dd className="mt-1 text-[#041B2D]">{proposal.cue}</dd></div>
        <div><dt className="font-bold text-[#486170]">Weekly target</dt><dd className="mt-1 text-[#041B2D]">{proposal.frequencyPerWeek} days</dd></div>
        <div><dt className="font-bold text-[#486170]">On a hard day</dt><dd className="mt-1 text-[#041B2D]">{proposal.minimumVersion}</dd></div>
      </dl>
      <p className="mt-4 text-sm leading-6 text-[#486170]">{proposal.rationale}</p>
      <p className="mt-3 text-xs font-semibold text-[#60798A]">Saving this queues the idea for your weekly review. It does not change your current week or any saved health record.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 text-sm font-bold text-white hover:bg-[#06695F] disabled:opacity-50">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Save for weekly review
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-[#486170] hover:border-slate-400 disabled:opacity-50">Not now</button>
      </div>
    </section>
  );
}
