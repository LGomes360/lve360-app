"use client";

import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2 } from "lucide-react";

/**
 * DailyLog.tsx
 * - Quick logging for sleep (1–5), energy (1–10), weight (lb), notes
 * - POST /api/logs inserts/updates today's row (server sets log_date=today)
 * - Prefills today's values if they exist
 * - Debounced autosave on sliders/weight (manual Save still available)
 * - After save, triggers Insights refresh via #ai-refresh-proxy click
 *
 * Table: public.logs(user_id, log_date, weight, sleep, energy, notes)
 * API:   POST /api/logs  (already in repo)
 */

type TodayRow = {
  weight: number | null;
  sleep: number | null;   // 1–5
  energy: number | null;  // 1–10
  notes: string | null;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const AUTOSAVE_MS = 1000;

export default function DailyLog() {
  const supabase = createClientComponentClient();

  const [sleep, setSleep] = useState<number>(3);
  const [energy, setEnergy] = useState<number>(5);
  const [weight, setWeight] = useState<string>(""); // keep as string for input UX
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [hasSleepValue, setHasSleepValue] = useState(false);
  const [hasEnergyValue, setHasEnergyValue] = useState(false);

  const userIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedHash = useRef<string>("");

  // Auto-hide inline toast
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  // Prefill today's log if it exists
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      userIdRef.current = uid;
      if (!uid) return;

      // Query today's row (server stores dates as UTC date; match ISO YYYY-MM-DD)
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("logs")
        .select("weight, sleep, energy, notes, log_date")
        .eq("user_id", uid)
        .eq("log_date", today)
        .maybeSingle();

      if (!error && data) {
        const row = data as TodayRow;
        if (row.sleep != null) { setSleep(clamp(row.sleep, 1, 5)); setHasSleepValue(true); }
        if (row.energy != null) { setEnergy(clamp(row.energy, 1, 10)); setHasEnergyValue(true); }
        if (row.weight != null) setWeight(String(row.weight));
        if (row.notes != null) setNotes(row.notes);
        setPrefilled(true);
        lastSavedHash.current = hashState(row.sleep ?? null, row.energy ?? null, row.weight ?? null, row.notes ?? "");
      } else {
        // initialize baseline hash from defaults
        lastSavedHash.current = hashState(3, 5, null, "");
      }

      loadedRef.current = true;
    })();
  }, [supabase]);

  // Debounced autosave for sliders & weight (notes excluded)
  useEffect(() => {
    if (!loadedRef.current) return;

    // Build current hash (notes excluded from autosave hash)
    const numericWeight = weight.trim() === "" ? null : Number(weight);
    // If only notes changed, do not autosave (manual Save handles notes)
    const hashWithoutNotes = hashState(hasSleepValue ? sleep : null, hasEnergyValue ? energy : null, Number.isFinite(numericWeight) ? numericWeight : null);

    const lastWithoutNotes = lastSavedHash.current.split("|NOTES:")[0];
    if (hashWithoutNotes === lastWithoutNotes) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      submit(true).catch(() => {});
    }, AUTOSAVE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleep, energy, weight, hasSleepValue, hasEnergyValue]);

  function onSleepChange(v: number) {
    setHasSleepValue(true);
    setSleep(clamp(v, 1, 5));
  }
  function onEnergyChange(v: number) {
    setHasEnergyValue(true);
    setEnergy(clamp(v, 1, 10));
  }

  function parseWeightInput(v: string) {
    // Allow digits + one dot; strip other chars
    const cleaned = v.replace(/[^\d.]/g, "");
    // Prevent multiple dots
    const parts = cleaned.split(".");
    if (parts.length > 2) return parts.slice(0, 2).join(".");
    return cleaned;
  }

  async function submit(isAutosave = false) {
    try {
      setSaving(true);
      if (!isAutosave) setMsg(null);

      const w = weight.trim() === "" ? null : Number(weight);
      const body: Record<string, any> = { notes: (notes || "").trim() || null };
      if (hasSleepValue) body.sleep = sleep;
      if (hasEnergyValue) body.energy = energy;
      if (w != null && Number.isFinite(w)) body.weight = w;

      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await safeJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "save_failed");

      // Update last saved signature
      lastSavedHash.current = hashState(hasSleepValue ? sleep : null, hasEnergyValue ? energy : null, w, notes);

      if (!isAutosave) setMsg({ kind: "ok", text: prefilled ? "Updated ✓" : "Saved ✓" });
      setPrefilled(true);

      // Nudge Insights to refresh
      try {
        const btn = document.getElementById("ai-refresh-proxy") as HTMLButtonElement | null;
        btn?.click();
      } catch {}

    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Error saving log." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="daily-log" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between mb-1">
        <h2 className="text-2xl font-bold text-[#041B2D]">Daily Check-in</h2>
        {prefilled && <span className="text-xs text-gray-600">Today’s values loaded</span>}
      </div>
      <p className="text-gray-600 mb-4">A quick check-in keeps your trends and coaching grounded in how you actually feel.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sleep (1–5) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-[#047F6D]">Sleep quality</div>
          <div className="text-xl font-bold text-[#041B2D] mt-1">{hasSleepValue ? `${sleep} / 5` : "Not logged yet"}</div>
          <input
            type="range"
            min={1}
            max={5}
            value={sleep}
            onChange={(e) => onSleepChange(Number(e.target.value))}
            className="w-full mt-3"
            aria-label="Sleep quality"
          />
          <div className="text-xs text-gray-600 mt-1">Think: how rested did you feel?</div>
        </div>

        {/* Energy (1–10) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-[#047F6D]">Energy</div>
          <div className="text-xl font-bold text-[#041B2D] mt-1">{hasEnergyValue ? `${energy} / 10` : "Not logged yet"}</div>
          <input
            type="range"
            min={1}
            max={10}
            value={energy}
            onChange={(e) => onEnergyChange(Number(e.target.value))}
            className="w-full mt-3"
            aria-label="Energy level"
          />
          <div className="text-xs text-gray-600 mt-1">How peppy were you overall?</div>
        </div>

        {/* Weight (optional) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-[#047F6D]">Weight (optional)</div>
          <input
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(parseWeightInput(e.target.value))}
            placeholder="e.g., 220"
            className="mt-2 w-full rounded-lg border px-3 py-2"
            aria-label="Weight in pounds"
          />
          <div className="text-xs text-gray-600 mt-1">Pounds. Leave blank if you didn’t weigh in.</div>
        </div>
      </div>

      {/* Notes */}
      <div className="mt-4">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What stood out today? (workout, sleep, stress, meals...)"
          className="w-full rounded-lg border px-3 py-2"
          aria-label="Daily notes"
        />
      </div>

      {/* Actions + inline toast */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => submit(false)}
          disabled={saving}
          className="inline-flex items-center rounded-xl bg-[#047F6D] px-4 py-2 text-white font-semibold shadow-md hover:bg-[#036957] disabled:opacity-60"
          aria-disabled={saving}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Save today’s log
        </button>

        {/* Saved chip (non-blocking, distinct from toast) */}
        {msg && (
          <div
            className={`text-sm rounded-lg px-3 py-1.5 border ${
              msg.kind === "ok"
                ? "text-teal-800 bg-teal-50 border-teal-200"
                : "text-amber-800 bg-amber-50 border-amber-200"
            }`}
            role="status"
            aria-live="polite"
          >
            {msg.text}
          </div>
        )}
      </div>
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

function hashState(
  sleep: number | null,
  energy: number | null,
  weight: number | null,
  notes?: string
) {
  return `S:${sleep ?? ""}|E:${energy ?? ""}|W:${weight ?? ""}|NOTES:${notes ?? ""}`;
}
