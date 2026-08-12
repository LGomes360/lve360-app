"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, Loader2, Sparkles } from "lucide-react";

import type { ReminderBehaviorSuggestion } from "@/lib/reminderBehavior";

type BehaviorResponse = {
  ok: boolean;
  enabled?: boolean;
  current_hour?: number | null;
  feedback_count?: number;
  suggestion?: ReminderBehaviorSuggestion | null;
};

export default function ReminderBehaviorCard() {
  const [data, setData] = useState<BehaviorResponse | null>(null);
  const [busy, setBusy] = useState<"accept_suggestion" | "decline_suggestion" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reminders/behavior", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null) as BehaviorResponse | null;
        if (!response.ok || !json?.ok) throw new Error("behavior_unavailable");
        return json;
      })
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setData({ ok: false }); });
    return () => { cancelled = true; };
  }, []);

  async function resolve(action: "accept_suggestion" | "decline_suggestion") {
    const resolvedSuggestion = data?.suggestion ?? null;
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch("/api/reminders/behavior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error("behavior_unavailable");
      setData((current) => current ? {
        ...current,
        suggestion: null,
        enabled: action === "accept_suggestion" && resolvedSuggestion?.kind === "pause" ? false : current.enabled,
        current_hour: action === "accept_suggestion" && resolvedSuggestion?.kind === "time"
          ? resolvedSuggestion.proposedHour
          : current.current_hour,
      } : current);
      setMessage(action === "accept_suggestion" ? "Your reminder plan was updated." : "Suggestion dismissed. Your current plan is unchanged.");
    } catch {
      setMessage("We could not update that reminder choice. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!data?.ok) return null;
  const suggestion = data.suggestion ?? null;

  return (
    <div className="mt-5 rounded-2xl border border-[#BCE3DA] bg-[#F4FAF8] p-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#087F72]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[#041B2D]">Reminder learning</p>
          {suggestion ? (
            <>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {suggestion.kind === "time"
                  ? `Based on ${suggestion.evidenceCount} recent signals, ${formatHour(suggestion.proposedHour)} may fit this practice better than ${formatHour(suggestion.currentHour)}.`
                  : `You marked ${suggestion.evidenceCount} recent reminders as not useful. Pause reminders for this weekly practice?`}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">This is only a suggestion. Quiet hours remain enforced and nothing changes until you approve it.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => void resolve("accept_suggestion")} className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#06695F] disabled:opacity-60">
                  {busy === "accept_suggestion" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  {suggestion.kind === "time" ? `Use ${formatHour(suggestion.proposedHour)}` : "Pause this practice's reminders"}
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void resolve("decline_suggestion")} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  Keep my current plan
                </button>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {data.feedback_count
                ? `LVE360 has ${data.feedback_count} recent timing ${data.feedback_count === 1 ? "signal" : "signals"}. We will suggest a change only when a clear pattern emerges.`
                : "When you arrive from a reminder, you can tell us whether its timing helped. We will suggest changes only after a clear pattern emerges."}
            </p>
          )}
          {message ? <p className="mt-3 text-sm font-semibold text-[#06695F]">{message}</p> : null}
          {data.enabled && typeof data.current_hour === "number" && !suggestion ? (
            <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Current delivery time: {formatHour(data.current_hour)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatHour(hour: number) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 0, 1, hour)));
}
