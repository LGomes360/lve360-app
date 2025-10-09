"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";

/**
 * InsightsFeed.tsx
 * - Shows the latest AI insights (ai_summaries) for the user
 * - Calls POST /api/ai-insights to (re)generate, then refetches
 *
 * Tables:
 *  - public.ai_summaries(id, user_id, summary, created_at)
 *
 * API:
 *  - POST /api/ai-insights  => returns { ok: true } (we refetch after)
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
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh insights.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="insights" className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
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
        >
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Hidden proxy so CTAs can trigger refresh without duplicating logic */}
      <button id="ai-refresh-proxy" onClick={regenerate} className="hidden" aria-hidden="true" />

      {loading ? (
        <div className="flex items-center text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin text-purple-600 mr-2" />
          Loading insights…
        </div>
      ) : error ? (
        <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {error}
        </div>
      ) : insights.length === 0 ? (
        <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4 text-gray-700">
          No insights yet. Log your day or click{" "}
          <button onClick={regenerate} disabled={busy} className="underline underline-offset-2">
            Generate now
          </button>
          .
        </div>
      ) : (
        <ul className="space-y-3">
          {insights.map((it) => (
            <li
              key={it.id}
              className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4"
            >
              <div className="text-xs uppercase tracking-wide text-purple-600 mb-1">
                {new Date(it.created_at).toLocaleString()}
              </div>
              <div className="text-[#041B2D]">{it.summary}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
