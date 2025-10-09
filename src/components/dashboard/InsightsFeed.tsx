"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";

/**
 * InsightsFeed.tsx
 * - Shows latest AI insights (ai_summaries)
 * - POST /api/ai-insights → regenerate then refetch
 * - Adds per-card actions (UI-only): Apply tweak, Add reminder
 */

type InsightRow = {
  id: string;
  summary: string;
  created_at: string;
};

export default function InsightsFeed() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // UI niceties
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [reminderFor, setReminderFor] = useState<InsightRow | null>(null);
  const [remindTime, setRemindTime] = useState<string>("22:00"); // default 10:00pm
  const [applyFor, setApplyFor] = useState<InsightRow | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function fetchInsights() {
    setLoading(true);
    setError(null);
    try {
      const { data: userWrap } = await supabase.auth.getUser();
      const userId = userWrap?.user?.id;
      if (!userId) {
        setInsights([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("ai_summaries")
        .select("id, summary, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (error) throw error;
      setInsights((data ?? []) as InsightRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load insights.");
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function regenerate() {
    try {
      setBusy(true);
      setError(null);
      const res = await fetch("/api/ai-insights", { method: "POST" });
      if (!res.ok) throw new Error(`AI generate failed (${res.status})`);
      await fetchInsights();
      setToast("Insights refreshed");
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh insights.");
    } finally {
      setBusy(false);
    }
  }

  // Content truncation helpers
  const MAX_CHARS = 220;
  const formatted = useMemo(() => {
    return insights.map((it) => {
      const full = (it.summary || "").trim();
      const isLong = full.length > MAX_CHARS;
      const isOpen = !!expanded[it.id];
      const text = isLong && !isOpen ? full.slice(0, MAX_CHARS) + "…" : full;
      return { ...it, text, isLong, isOpen };
    });
  }, [insights, expanded]);

  return (
    <div id="insights" className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm" aria-label="AI insights">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold text-[#041B2D] flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#7C3AED]" />
          AI Insights
        </h2>
        <button
          onClick={regenerate}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm hover:bg-white disabled:opacity-60"
          title="Refresh insights"
          aria-label="Refresh insights"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Hidden proxy so CTAs (e.g., in NextSteps) can trigger refresh */}
      <button id="ai-refresh-proxy" onClick={regenerate} className="hidden" aria-hidden="true" />

      {loading ? (
        <div className="flex items-center text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin text-purple-600 mr-2" />
          Loading insights…
        </div>
      ) : error ? (
        <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{error}</div>
      ) : formatted.length === 0 ? (
        <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4 text-gray-700">
          No insights yet. Log your day or click{" "}
          <button onClick={regenerate} disabled={busy} className="underline underline-offset-2">
            Generate now
          </button>
          .
        </div>
      ) : (
        <ul className="space-y-3">
          {formatted.map((it) => (
            <li
              key={it.id}
              className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4"
            >
              <div className="text-xs uppercase tracking-wide text-purple-600 mb-1">
                {new Date(it.created_at).toLocaleString()}
              </div>

              {/* Insight body with expand/collapse */}
              <div className="text-[#041B2D]">
                {it.text}{" "}
                {it.isLong && (
                  <button
                    onClick={() => setExpanded((m) => ({ ...m, [it.id]: !m[it.id] }))}
                    className="text-[#7C3AED] underline underline-offset-2 text-sm"
                    aria-expanded={!!expanded[it.id]}
                    aria-label={expanded[it.id] ? "Show less" : "Show more"}
                  >
                    {expanded[it.id] ? "Show less" : "Show more"}
                  </button>
                )}
              </div>

              {/* Action row */}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setApplyFor(it)}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white"
                  aria-label="Apply this tweak"
                  title="Apply this tweak"
                >
                  Apply tweak
                </button>
                <button
                  onClick={() => {
                    setReminderFor(it);
                    setRemindTime("22:00");
                  }}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white"
                  aria-label="Add a reminder related to this insight"
                  title="Add reminder"
                >
                  Add reminder
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Apply Tweak Modal (UI only, placeholder for future rules endpoint) */}
      {applyFor && (
        <Modal onClose={() => setApplyFor(null)} title="Apply this tweak">
          <p className="text-sm text-gray-700">
            We’ll remember this tweak and use it to personalize your suggestions. (This is a visual
            confirmation for now.)
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setApplyFor(null)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white">
              Cancel
            </button>
            <button
              onClick={() => {
                setApplyFor(null);
                setToast("Tweak applied");
              }}
              className="rounded-lg bg-[#7C3AED] text-white px-3 py-1.5 text-sm"
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}

      {/* Reminder Modal (UI only, placeholder for reminders table/automation) */}
      {reminderFor && (
        <Modal onClose={() => setReminderFor(null)} title="Add reminder">
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Pick a daily time to nudge you about this insight. (UI-only for now.)
            </p>
            <div>
              <label className="text-xs uppercase tracking-wide text-purple-600">Time</label>
              <input
                type="time"
                value={remindTime}
                onChange={(e) => setRemindTime(e.target.value)}
                className="mt-1 rounded-lg border px-3 py-2"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setReminderFor(null)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white">
              Cancel
            </button>
            <button
              onClick={() => {
                setReminderFor(null);
                setToast("Reminder added");
              }}
              className="rounded-lg bg-[#06C1A0] text-white px-3 py-1.5 text-sm"
            >
              Save
            </button>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4" aria-live="polite">
          <div className="rounded-xl border border-purple-200 bg-white/90 backdrop-blur-md shadow-lg px-4 py-2 text-sm text-[#041B2D]">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Small modal ---------- */
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#041B2D]">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
