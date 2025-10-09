"use client";

import { useEffect, useState } from "react";
import { Loader2, Target, Check, ChevronRight } from "lucide-react";

/**
 * WeeklyGoal.tsx — API-first, non-destructive
 * - Uses your existing API route at /api/goals (GET + POST)
 * - Flexible response parsing: supports {ok:true, goals:{...}} or direct row payloads
 * - Updates only: custom_goal (string) and goals (string[])
 * - If API is unreachable or schema differs, shows a safe message
 */

type GoalsRow = {
  id?: string;
  user_id?: string;
  target_weight?: number | null;
  target_sleep?: number | null;
  target_energy?: number | null;
  custom_goal?: string | null;
  goals?: string[] | null;
  xp?: number | null;
  streak_days?: number | null;
  last_log_date?: string | null;
};

const PRESETS = ["Sleep quality", "Morning energy", "Body weight", "Stress", "Focus", "Gut comfort"];

// If your route lives somewhere else, change this to match:
const GOALS_API_PATH = "/api/goals";

export default function WeeklyGoal() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<GoalsRow | null>(null);
  const [focus, setFocus] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Helper to normalize API responses from GET/POST
  function normalize(resJson: any): GoalsRow | null {
    if (!resJson) return null;
    // { ok: true, goals: {...} }
    if (typeof resJson === "object" && "ok" in resJson) {
      if (resJson.ok && resJson.goals && typeof resJson.goals === "object") return resJson.goals as GoalsRow;
      return null;
    }
    // direct row
    if (typeof resJson === "object" && ("user_id" in resJson || "custom_goal" in resJson || "goals" in resJson)) {
      return resJson as GoalsRow;
    }
    // { data: {...} }
    if (resJson.data && typeof resJson.data === "object") return resJson.data as GoalsRow;
    return null;
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setUnavailable(null);

        const res = await fetch(GOALS_API_PATH, { method: "GET", cache: "no-store" });
        if (!res.ok) {
          setUnavailable(`Goals API returned ${res.status}`);
          setLoading(false);
          return;
        }
        const json = await res.json();
        const g = normalize(json);
        if (!g) {
          setUnavailable("Goals API: unexpected response shape.");
          setLoading(false);
          return;
        }

        setRow(g);
        setFocus(g.custom_goal ?? "");
        setTags(Array.isArray(g.goals) ? g.goals! : []);
      } catch (e: any) {
        setUnavailable("Goals API not reachable.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    try {
      setSaving(true);
      const res = await fetch(GOALS_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // send only what we intend to change:
          custom_goal: (focus || "").trim(),
          goals: tags,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Save failed (${res.status})`);
      const g = normalize(json);
      if (g) setRow(g);
      setToast("Weekly goal saved");
    } catch (e: any) {
      setToast(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  if (loading) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
        <div className="flex items-center text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin text-purple-600 mr-2" />
          Loading weekly goal…
        </div>
      </div>
    );
  }
  if (unavailable) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
        <div className="text-gray-700">{unavailable}</div>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[#041B2D] flex items-center gap-2">
          <Target className="w-5 h-5 text-[#7C3AED]" />
          Weekly Goal
        </h2>
        {typeof row?.streak_days === "number" && (
          <div className="inline-flex items-center gap-1 text-sm rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-teal-700" title="From your goals row">
            <Check className="w-4 h-4" />
            Streak: <strong className="ml-1">{row.streak_days}</strong> days
          </div>
        )}
      </div>

      <p className="text-gray-600 mt-1">Pick one focus for this week. Your plan and insights adapt.</p>

      {/* Focus input */}
      <div className="mt-4">
        <label className="text-xs uppercase tracking-wide text-purple-600">Weekly focus</label>
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="e.g., In bed by 10:30pm"
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </div>

      {/* Preset chips */}
      <div className="mt-3">
        <div className="text-xs uppercase tracking-wide text-purple-600">Quick presets</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = tags.includes(p);
            return (
              <button
                key={p}
                onClick={() => toggleTag(p)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  active ? "bg-purple-600 text-white border-purple-600" : "hover:bg-white"
                }`}
                aria-pressed={active}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {row?.custom_goal ? `Current: “${row.custom_goal}”` : "No goal set yet"}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center rounded-xl bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] px-4 py-2 text-white font-semibold shadow-md disabled:opacity-60"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Save goal
          <ChevronRight className="w-4 h-4 ml-1" />
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className="rounded-xl border border-purple-200 bg-white/90 backdrop-blur-md shadow-lg px-4 py-2 text-sm text-[#041B2D]">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
