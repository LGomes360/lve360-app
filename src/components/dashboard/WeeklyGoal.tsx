"use client";

import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2, Target, ChevronRight } from "lucide-react";

/**
 * WeeklyGoal.tsx
 * GET  /api/goals?userId=<id>  -> { goals: string[], custom_goal: string|null }
 * POST /api/goals              -> { ok: true, goals: ... }
 *
 * Enhancements:
 * - Debounced autosave on change (800ms)
 * - Preset limit (max 3) with toast
 * - Character counter (0–80)
 * - Enter=save, Esc=revert focus
 * - Quick links after save
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

const MAX_PRESETS = 3;
const MAX_CHARS = 80;
const AUTOSAVE_MS = 800;

export default function WeeklyGoal() {
  const supabase = createClientComponentClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [focus, setFocus] = useState<string>("");
  const [initialFocus, setInitialFocus] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [initialTags, setInitialTags] = useState<string[]>([]);

  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
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
        const t = Array.isArray(json.goals) ? json.goals : [];
        const f = (json.custom_goal ?? "").slice(0, MAX_CHARS);

        setTags(t);
        setInitialTags(t);
        setFocus(f);
        setInitialFocus(f);
      } catch {
        setErrorMsg("Unable to load weekly goal.");
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  // Debounced autosave when focus/tags change (after initial load)
  useEffect(() => {
    if (loading || !userId) return;
    const changed = focus !== initialFocus || diff(tags, initialTags).length > 0;
    if (!changed) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      save(true).catch(() => {});
    }, AUTOSAVE_MS);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, tags]);

  async function save(isAutosave = false) {
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

      // Update baselines after a successful save
      setInitialFocus(focus);
      setInitialTags(tags);
      setSavedOnce(true);

      if (!isAutosave) setToast("Weekly goal saved");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(t: string) {
    setTags((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= MAX_PRESETS) {
        setToast(`You can choose up to ${MAX_PRESETS}`);
        return prev;
      }
      return [...prev, t];
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      save(false);
    } else if (e.key === "Escape") {
      // revert to last saved focus
      setFocus(initialFocus);
    }
  }

  const focusCount = focus.length;
  const changed = focus !== initialFocus || diff(tags, initialTags).length > 0;

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
    <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm" aria-label="Weekly goal">
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
        <div className="relative">
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={onKeyDown}
            placeholder="e.g., In bed by 10:30pm"
            className="mt-1 w-full rounded-lg border px-3 py-2 pr-14"
            aria-describedby="focus-limit"
          />
          <div
            id="focus-limit"
            className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${
              focusCount > MAX_CHARS - 10 ? "text-gray-700" : "text-gray-400"
            }`}
            aria-live="polite"
          >
            {focusCount}/{MAX_CHARS}
          </div>
        </div>
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
                aria-label={`Toggle preset ${p}`}
              >
                {p}
              </button>
            );
          })}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          Choose up to {MAX_PRESETS}. {tags.length}/{MAX_PRESETS} selected.
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-xs text-gray-500">
          {focus ? `Current: “${focus}”` : "No goal set yet"}
          {savedOnce && (
            <>
              {" "}|{" "}
              <a href="#todays-plan" className="underline underline-offset-2 hover:text-[#041B2D]">
                Today’s Plan
              </a>{" "}
              •{" "}
              <a href="#progress" className="underline underline-offset-2 hover:text-[#041B2D]">
                Progress
              </a>
            </>
          )}
        </div>

        <button
          onClick={() => save(false)}
          disabled={saving || !changed}
          className="inline-flex items-center rounded-xl bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] px-4 py-2 text-white font-semibold shadow-md disabled:opacity-60"
          aria-disabled={saving || !changed}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {changed ? "Save goal" : "Saved"}
          <ChevronRight className="w-4 h-4 ml-1" />
        </button>
      </div>

      {/* Toast (aria-live for screen readers) */}
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

/* utils */
async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function diff(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b);
  const add = a.filter((x) => !B.has(x));
  const rem = b.filter((x) => !A.has(x));
  return [...add, ...rem];
}
