"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * DailyLog.tsx
 * - Quick on-dash logging: sleep (1–5), energy (1–10), weight (lb), notes
 * - Calls your existing /api/logs (POST) to insert today's row
 * - Shows simple toasts and disables while saving
 *
 * Table: public.logs(user_id, log_date, weight, sleep, energy, notes)
 * API:   POST /api/logs  (already in your repo)
 */

export default function DailyLog() {
  const [sleep, setSleep] = useState<number>(3);
  const [energy, setEnergy] = useState<number>(5);
  const [weight, setWeight] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  async function submit() {
    try {
      setSaving(true);
      setMsg(null);

      // Build payload; let the server set log_date to today
      const body: any = {
        sleep,
        energy,
        notes: notes.trim() || null,
      };
      const w = Number(weight);
      if (!Number.isNaN(w) && weight !== "") body.weight = w;

      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "save_failed");

      setMsg({ kind: "ok", text: "Saved! Your snapshot & insights will reflect this." });
      // Clear notes only (keep sliders where they were)
      setNotes("");
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Error saving log." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="log" className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-[#041B2D] mb-1">📝 Daily Log</h2>
      <p className="text-gray-600 mb-4">Two sliders, an optional weight, and a quick note. 20 seconds, tops.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sleep (1–5) */}
        <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4">
          <div className="text-xs uppercase tracking-wide text-purple-600">Sleep quality</div>
          <div className="text-xl font-bold text-[#041B2D] mt-1">{sleep} / 5</div>
          <input
            type="range" min={1} max={5} value={sleep}
            onChange={(e) => setSleep(Number(e.target.value))}
            className="w-full mt-3"
          />
          <div className="text-xs text-gray-600 mt-1">Think: how rested did you feel?</div>
        </div>

        {/* Energy (1–10) */}
        <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4">
          <div className="text-xs uppercase tracking-wide text-purple-600">Energy</div>
          <div className="text-xl font-bold text-[#041B2D] mt-1">{energy} / 10</div>
          <input
            type="range" min={1} max={10} value={energy}
            onChange={(e) => setEnergy(Number(e.target.value))}
            className="w-full mt-3"
          />
          <div className="text-xs text-gray-600 mt-1">How peppy were you overall?</div>
        </div>

        {/* Weight (optional) */}
        <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4">
          <div className="text-xs uppercase tracking-wide text-purple-600">Weight (optional)</div>
          <input
            inputMode="decimal"
            pattern="[0-9]*"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="e.g., 220"
            className="mt-2 w-full rounded-lg border px-3 py-2"
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
        />
      </div>

      {/* Actions + toast */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center rounded-xl bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] px-4 py-2 text-white font-semibold shadow-md disabled:opacity-60"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Save today’s log
        </button>
        {msg && (
          <div
            className={`text-sm rounded-lg px-3 py-1.5 border ${
              msg.kind === "ok"
                ? "text-teal-800 bg-teal-50 border-teal-200"
                : "text-amber-800 bg-amber-50 border-amber-200"
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
