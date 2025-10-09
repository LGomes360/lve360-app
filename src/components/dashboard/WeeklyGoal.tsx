"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2, Target, ChevronRight } from "lucide-react";

/**
 * WeeklyGoal.tsx
 * - Talks to your existing API:
 *   GET  /api/goals?userId=<id>  -> { goals: string[], custom_goal: string|null }
 *   POST /api/goals              -> { ok: true, goals: ... }
 * - Updates ONLY: custom_goal (string) and goals (string[])
 */

type GoalsGetResponse = {
  goals: string[];
  custom_goal: string | null;
};

const PRESETS = [
  "Sleep quality",
  "Morning energy",
  "Body weight",
  "Stress",
  "Focus",
  "Gut comfort",
];

export default function WeeklyGoal() {
  const supabase = createClientComponentClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [focus, setFocus] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);

  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // load user id, then fetch goals
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const { data } = await supabase.auth.getUser();
        const id = data?.user?.id ?? null;
        setUserId(id);

        if (!id) {
          setErrorMsg("Not signed in.");
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/goals?userId=${encodeURIComponent(id)}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          const j = await safeJson(res);
          setErrorMsg(j?.error || `Goals API error (${res.status})`);
          setLoading(false);
          return;
        }
        const json = (await res.json()) as GoalsGetResponse;
        setTags(Array.isArray(json.goals) ? json.goals : []);
        setFocus(json.custom_goal ?? "");
      } catch (e: any) {
        setErrorMsg("Unable to load weekly goal.");
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  async function save() {
    if (!userId) {
      setErrorMsg("Not signed in.");
      return;
    }
    try {
      setSaving(true);
      setErrorMsg(null);

      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          goals: tags,
          custom_goal: (focus || "").trim() || null,
        }),
      });

      const json = await safeJson(res);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Save failed (${res.status})`);
      }

      setToast("Weekly goal saved");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Save failed");
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

  if (errorMsg) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
        <div className="text-gray-700">{errorMsg}</div>
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
      </div>

      <p className="text-gray-600 mt-1">
        Pick one focus for this week. Your plan and insights will adapt.
      </p>

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

      {/* Footer actions */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {focus ? `Current: “${focus}”` : "No goal set yet"}
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

/* utils */
async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
