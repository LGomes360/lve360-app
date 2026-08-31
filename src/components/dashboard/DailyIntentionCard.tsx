"use client";

import { Check, Loader2, Pencil, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  dailyIntentionErrorMessage,
  validateDailyIntention,
  type DailyIntentionRecord,
  type DailyIntentionSource,
  type DailyIntentionSuggestion,
} from "@/lib/dailyIntention";
import { localDateString } from "@/lib/regimenSchedule";

type ApiPayload = { ok?: boolean; intention?: DailyIntentionRecord | null; error?: string; reason?: string };

export default function DailyIntentionCard({
  date,
  compact = false,
}: {
  date?: string | null;
  compact?: boolean;
}) {
  const localDate = date ?? localDateString();
  const [record, setRecord] = useState<DailyIntentionRecord | null>(null);
  const [phrase, setPhrase] = useState("");
  const [reflection, setReflection] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "ideas" | null>(null);
  const [editing, setEditing] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/daily-intention?date=${encodeURIComponent(localDate)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as ApiPayload | null;
      if (!response.ok || !payload?.ok) throw new Error("unavailable");
      setRecord(payload.intention ?? null);
      setPhrase(payload.intention?.phrase ?? "");
    } catch {
      setError("Your daily intention is temporarily unavailable. The rest of Today still works.");
    } finally {
      setLoading(false);
    }
  }, [localDate]);

  useEffect(() => { void load(); }, [load]);

  async function saveIntention(nextPhrase: string, source: DailyIntentionSource, focusWord?: string | null) {
    const validation = validateDailyIntention(nextPhrase);
    if (!validation.ok) {
      setError(dailyIntentionErrorMessage(validation.error));
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const response = await fetch("/api/daily-intention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: localDate, phrase: validation.phrase, focusWord, source }),
      });
      const payload = await response.json().catch(() => null) as ApiPayload | null;
      if (!response.ok || !payload?.ok || !payload.intention) throw new Error(payload?.error ?? "save_failed");
      setRecord(payload.intention);
      setPhrase(payload.intention.phrase ?? "");
      setEditing(false);
      setShowCoach(false);
    } catch {
      setError("We could not save that intention. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function askForIdeas() {
    setBusy("ideas");
    setError(null);
    try {
      const response = await fetch("/api/daily-intention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: localDate, reflection }),
      });
      const payload = await response.json().catch(() => null) as ApiPayload | null;
      if (!response.ok || !payload?.ok || !payload.intention) throw new Error(payload?.error ?? "ideas_failed");
      setRecord(payload.intention);
      setShowCoach(true);
    } catch {
      setError("Ask LVE360 could not prepare ideas right now. You can still write your own intention.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-3xl border border-[#BCE3DA] bg-white p-5 shadow-sm" aria-label="Loading daily intention">
        <p className="flex items-center text-sm font-semibold text-slate-600"><Loader2 className="mr-2 h-4 w-4 animate-spin text-[#087F72]" /> Preparing your day</p>
      </section>
    );
  }

  if (record?.phrase && !editing) {
    const selectedSuggestion = record.suggestions.find((item) => item.phrase === record.phrase) ?? null;
    return (
      <section className={`overflow-hidden border border-[#8CCFC1] bg-gradient-to-r from-[#EAFBF8] via-white to-[#F4EEFF] shadow-sm ${compact ? "rounded-2xl p-4 sm:p-5" : "rounded-3xl p-5 sm:p-6"}`} aria-labelledby="daily-intention-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]"><Check className="mr-2 h-4 w-4" /> Your intention today</p>
            <h2 id="daily-intention-title" className="mt-2 text-2xl font-black leading-tight text-[#041B2D]">{record.phrase}</h2>
            {record.focusWord ? <p className="mt-2 text-sm font-semibold text-[#486170]">Focus word: {record.focusWord}</p> : null}
            {selectedSuggestion?.whyThisFits ? (
              <p className="mt-3 max-w-2xl rounded-xl bg-white/75 px-3 py-2 text-sm leading-6 text-[#486170] ring-1 ring-[#D8EEE9]">
                <span className="font-bold text-[#06695F]">Why this fits today:</span> {selectedSuggestion.whyThisFits}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-[#9DCFC3] bg-white px-4 py-2 text-sm font-bold text-[#06695F] hover:bg-[#F4FAF8]">
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </button>
        </div>
      </section>
    );
  }

  const suggestions = record?.suggestions ?? [];
  const editorContent = (
    <div className="space-y-4">
      {error ? <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900" role="alert">{error}</p> : null}
      <div>
        <label htmlFor="daily-intention" className="text-sm font-bold text-[#041B2D]">Today I want to be...</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="daily-intention"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value.slice(0, 120))}
            placeholder="I choose calm focus today."
            className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-[#041B2D] focus:border-[#087F72] focus:outline-none focus:ring-2 focus:ring-[#087F72]/20"
          />
          <button type="button" onClick={() => void saveIntention(phrase, "self")} disabled={busy !== null} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 text-sm font-bold text-white hover:bg-[#06695F] disabled:opacity-60">
            {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Set my intention
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Keep it positive, present tense, and 11 words or fewer.</p>
      </div>

      <div className="border-t border-slate-100 pt-4">
        {!showCoach ? (
          <button type="button" onClick={() => setShowCoach(true)} disabled={busy !== null} className="inline-flex min-h-11 items-center rounded-xl border border-[#087F72] bg-[#EAFBF8] px-4 py-2 text-sm font-bold text-[#06695F] hover:bg-[#DDF7F1] disabled:opacity-60">
            <Sparkles className="mr-2 h-4 w-4" /> Ask LVE360 for ideas
          </button>
        ) : (
          <div className="rounded-2xl border border-[#BCE3DA] bg-[#F8FCFB] p-4 sm:p-5">
            <p className="flex items-center text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]"><Sparkles className="mr-2 h-4 w-4" /> Ask LVE360</p>
            <h3 className="mt-2 font-black text-[#041B2D]">Three ways you could meet today</h3>
            {!suggestions.length ? (
              <div className="mt-4">
                <label htmlFor="daily-reflection" className="text-sm font-bold text-[#041B2D]">What feels most important today? <span className="font-normal text-slate-500">Optional</span></label>
                <textarea id="daily-reflection" value={reflection} onChange={(event) => setReflection(event.target.value.slice(0, 240))} rows={2} placeholder="A demanding workday, reconnecting with family, protecting my energy..." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-[#041B2D] focus:border-[#087F72] focus:outline-none focus:ring-2 focus:ring-[#087F72]/20" />
                <button type="button" onClick={() => void askForIdeas()} disabled={busy !== null} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 text-sm font-bold text-white hover:bg-[#06695F] disabled:opacity-60">
                  {busy === "ideas" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Give me three ideas
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <div className="grid gap-3 lg:grid-cols-3">
                  {suggestions.map((suggestion: DailyIntentionSuggestion) => (
                    <button key={suggestion.phrase} type="button" onClick={() => void saveIntention(suggestion.phrase, "ask_lve360", suggestion.focusWord)} disabled={busy !== null} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#087F72] hover:shadow-sm disabled:opacity-60">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#087F72]">{suggestion.focusWord}</span>
                      <span className="mt-2 block text-sm font-bold leading-6 text-[#041B2D]">{suggestion.phrase}</span>
                      <span className="mt-3 block border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">
                        <span className="font-bold text-[#486170]">Why this fits:</span> {suggestion.whyThisFits}
                      </span>
                      <span className="mt-3 block text-xs font-bold text-[#06695F]">Use this intention</span>
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => void askForIdeas()} disabled={busy !== null} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[#9DCFC3] bg-white px-4 py-2 text-sm font-bold text-[#06695F] hover:bg-[#F4FAF8] disabled:opacity-60">
                  {busy === "ideas" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Refresh with my latest LVE360 context
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (compact) {
    return (
      <details className="rounded-2xl border border-[#BCE3DA] bg-white shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none">
          <span>
            <span className="block text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">Optional intention</span>
            <span className="mt-1 block font-bold text-[#041B2D]">Choose how you want to show up today</span>
          </span>
          <span className="shrink-0 text-sm font-bold text-[#06695F]">Set intention</span>
        </summary>
        <div className="border-t border-[#D8EEE9] p-5 sm:p-6">{editorContent}</div>
      </details>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-[#8CCFC1] bg-white shadow-sm" aria-labelledby="daily-intention-title">
      <div className="bg-gradient-to-br from-[#EAFBF8] via-white to-[#F4EEFF] p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Begin with intention</p>
        <h2 id="daily-intention-title" className="mt-2 text-2xl font-black text-[#041B2D]">How do you want to show up today?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#486170]">Choose a quality to bring into the day. This is a mindset, not another task to complete.</p>
      </div>
      <div className="border-t border-[#D8EEE9] p-5 sm:p-6">{editorContent}</div>
    </section>
  );
}
