"use client";

import { useState } from "react";
import { Check, Clock3, Loader2, X } from "lucide-react";

import type { ReminderFeedbackType } from "@/lib/reminderBehavior";

export default function ReminderArrivalFeedback({ deliveryId }: { deliveryId: string | null }) {
  const [busy, setBusy] = useState<ReminderFeedbackType | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!deliveryId || recorded) return null;

  async function record(feedback: ReminderFeedbackType) {
    setBusy(feedback);
    setError(null);
    try {
      const response = await fetch("/api/reminders/behavior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feedback", delivery_id: deliveryId, feedback }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error("feedback_unavailable");
      setRecorded(true);
    } catch {
      setError("We could not save that feedback. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[#BCE3DA] bg-white p-4 shadow-sm" aria-labelledby="reminder-feedback-heading">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#087F72]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="reminder-feedback-heading" className="font-bold text-[#041B2D]">Did this reminder arrive at a useful time?</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Your answer can shape a future suggestion. LVE360 will never change the time without asking you first.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <FeedbackButton label="Yes" value="useful" busy={busy} onSelect={record} icon={Check} />
            <FeedbackButton label="Too early" value="too_early" busy={busy} onSelect={record} />
            <FeedbackButton label="Too late" value="too_late" busy={busy} onSelect={record} />
            <FeedbackButton label="Not useful" value="not_useful" busy={busy} onSelect={record} icon={X} />
          </div>
          {error ? <p className="mt-2 text-sm font-medium text-rose-700">{error}</p> : null}
        </div>
        <button type="button" disabled={Boolean(busy)} onClick={() => void record("dismissed")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-60" aria-label="Dismiss reminder timing question">
          {busy === "dismissed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </button>
      </div>
    </section>
  );
}

function FeedbackButton({
  label,
  value,
  busy,
  onSelect,
  icon: Icon,
}: {
  label: string;
  value: ReminderFeedbackType;
  busy: ReminderFeedbackType | null;
  onSelect: (value: ReminderFeedbackType) => Promise<void>;
  icon?: typeof Check;
}) {
  return (
    <button
      type="button"
      disabled={Boolean(busy)}
      onClick={() => void onSelect(value)}
      className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#9DCFC3] hover:bg-[#F4FAF8] disabled:opacity-60"
    >
      {busy === value ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : Icon ? <Icon className="mr-1.5 h-4 w-4" /> : null}
      {label}
    </button>
  );
}
