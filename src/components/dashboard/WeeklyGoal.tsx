"use client";

import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { ChevronRight, Loader2, Target } from "lucide-react";

type GoalsGetResponse = { goals: string[]; custom_goal: string | null };

const PRESETS = [
  { label: "Sleep quality", focus: "Keep a consistent bedtime and wake time this week" },
  { label: "Morning energy", focus: "Record morning energy on three days this week" },
  { label: "Body weight", focus: "Take a 10-minute walk after the largest meal each day" },
  { label: "Stress", focus: "Practice five minutes of slow breathing each day" },
  { label: "Focus", focus: "Complete one distraction-free focus block each day" },
  { label: "Gut comfort", focus: "Track meals and gut comfort on three days this week" },
] as const;

const MAX_CHARS = 100;
const AUTOSAVE_MS = 800;

export default function WeeklyGoal() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [focus, setFocus] = useState("");
  const [initialFocus, setInitialFocus] = useState("");
  const [priorities, setPriorities] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const id = data?.user?.id ?? null;
        setUserId(id);
        if (!id) throw new Error("Not signed in.");
        const res = await fetch(`/api/goals?userId=${encodeURIComponent(id)}`, { cache: "no-store" });
        const json = (await safeJson(res)) as GoalsGetResponse | null;
        if (!res.ok) throw new Error((json as any)?.error || "Unable to load weekly focus.");
        const loadedFocus = (json?.custom_goal ?? "").slice(0, MAX_CHARS);
        setPriorities(normalizePriorities(json?.goals ?? []));
        setFocus(loadedFocus);
        setInitialFocus(loadedFocus);
      } catch (error: any) {
        setErrorMsg(error?.message ?? "Unable to load weekly focus.");
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  useEffect(() => {
    if (loading || !userId || focus === initialFocus) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => save(true).catch(() => {}), AUTOSAVE_MS);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, loading, userId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function save(isAutosave = false) {
    if (!userId) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const normalizedFocus = focus.trim();
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, goals: priorities, custom_goal: normalizedFocus || null }),
      });
      const json = await safeJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Save failed");
      setFocus(normalizedFocus);
      setInitialFocus(normalizedFocus);
      if (!isAutosave) setToast(normalizedFocus ? "Weekly focus saved" : "Weekly focus cleared");
    } catch (error: any) {
      setErrorMsg(error?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card><Loader2 className="mr-2 h-5 w-5 animate-spin text-purple-600" /> Loading weekly focus…</Card>;
  if (errorMsg) return <Card>{errorMsg}</Card>;

  const changed = focus !== initialFocus;
  return (
    <div className="rounded-2xl bg-white/70 p-6 shadow-sm" aria-label="Weekly focus">
      <h2 className="flex items-center gap-2 text-2xl font-bold text-[#041B2D]">
        <Target className="h-5 w-5 text-[#7C3AED]" /> Weekly Focus
      </h2>
      <p className="mt-1 text-gray-600">Choose one practical experiment for this week.</p>

      <div className="mt-4">
        <label className="text-xs uppercase tracking-wide text-purple-600" htmlFor="weekly-focus">This week I will</label>
        <div className="relative">
          <input id="weekly-focus" value={focus} onChange={(event) => setFocus(event.target.value.slice(0, MAX_CHARS))}
            placeholder="e.g., Keep caffeine before noon" className="mt-1 w-full rounded-lg border px-3 py-2 pr-16" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{focus.length}/{MAX_CHARS}</span>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs uppercase tracking-wide text-purple-600">Choose one starter focus</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button key={preset.label} onClick={() => setFocus(preset.focus)} aria-pressed={focus === preset.focus}
              className={`rounded-full border px-3 py-1 text-sm ${focus === preset.focus ? "border-purple-600 bg-purple-600 text-white" : "hover:bg-white"}`}>
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {priorities.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Your long-term priorities</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {priorities.map((priority) => <span key={priority} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{priority}</span>)}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-gray-500">{initialFocus ? `Current focus: “${initialFocus}”` : "Choose a focus to begin."}</div>
        <button onClick={() => save(false)} disabled={saving || !changed}
          className="inline-flex items-center rounded-xl bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] px-4 py-2 font-semibold text-white shadow-md disabled:opacity-60">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {changed ? (focus.trim() ? "Save focus" : "Clear focus") : (focus ? "Saved" : "Choose a focus")}
          <ChevronRight className="ml-1 h-4 w-4" />
        </button>
      </div>
      {toast && <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4" aria-live="polite"><div className="rounded-xl border border-purple-200 bg-white/90 px-4 py-2 text-sm shadow-lg">{toast}</div></div>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center rounded-2xl bg-white/70 p-6 text-gray-700 shadow-sm">{children}</div>;
}

function normalizePriorities(values: string[]) {
  const seen = new Set<string>();
  return values.map((value) => String(value).trim().replace(/\s+/g, " ")).filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

async function safeJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}
