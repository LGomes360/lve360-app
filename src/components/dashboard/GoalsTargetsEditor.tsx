"use client";

import { useState } from "react";

export default function GoalsTargetsEditor(props: {
  targetWeight: number | null;
  targetSleep: number | null;
  targetEnergy: number | null;
  onSaved?: (v: {weight: number|null; sleep: number|null; energy: number|null}) => void;
}) {
  const [weight, setWeight] = useState<string>(props.targetWeight?.toString() ?? "");
  const [sleep, setSleep]   = useState<string>(props.targetSleep?.toString() ?? "");
  const [energy, setEnergy] = useState<string>(props.targetEnergy?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<string | null>(null);

  async function save() {
    setSaving(true); setMsg(null);
    const payload = {
      target_weight: weight.trim() === "" ? null : Number(weight),
      target_sleep:  sleep.trim()  === "" ? null : Number(sleep),
      target_energy: energy.trim() === "" ? null : Number(energy),
    };
    const r = await fetch("/api/goals/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    setSaving(false);
    if (j?.ok) {
      setMsg("Saved!");
      props.onSaved?.({
        weight: payload.target_weight, sleep: payload.target_sleep, energy: payload.target_energy
      });
      setTimeout(() => setMsg(null), 1800);
    } else {
      setMsg(j?.error || "Save failed");
    }
  }

  return (
    <section className="rounded-2xl bg-white/70 backdrop-blur-md border border-purple-100 p-4 shadow-sm">
      <div className="text-sm font-semibold text-[#041B2D] mb-2">Set your targets</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs text-zinc-600">
          Target Weight (lb)
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            inputMode="decimal"
            placeholder="e.g. 180"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label className="text-xs text-zinc-600">
          Target Sleep (hrs)
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            inputMode="decimal"
            placeholder="e.g. 7.5"
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
          />
        </label>
        <label className="text-xs text-zinc-600">
          Target Energy (0–10)
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            inputMode="decimal"
            placeholder="e.g. 8"
            value={energy}
            onChange={(e) => setEnergy(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] px-3 py-1.5 text-white text-sm font-semibold shadow-md disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save targets"}
        </button>
        {msg && <span className="text-xs text-zinc-600">{msg}</span>}
      </div>
    </section>
  );
}
