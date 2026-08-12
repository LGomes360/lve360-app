"use client";

import { AlertTriangle, Check, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

import { regimenScheduleLabel } from "@/lib/regimenSchedule";
import type { RoutineCopilotKind, RoutineCopilotProposal } from "@/lib/routineCopilot";

export default function RoutineCopilotPanel({
  kind,
  existingName,
  onApply,
}: {
  kind: RoutineCopilotKind;
  existingName?: string | null;
  onApply: (proposal: RoutineCopilotProposal) => void;
}) {
  const [sourceText, setSourceText] = useState("");
  const [proposal, setProposal] = useState<RoutineCopilotProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function organize() {
    setBusy(true);
    setError(null);
    setApplied(false);
    try {
      const response = await fetch("/api/routine/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText, kind, existingName }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || !body?.proposal) throw new Error(body?.error ?? "routine_copilot_unavailable");
      setProposal(body.proposal as RoutineCopilotProposal);
    } catch {
      setProposal(null);
      setError("We could not organize that text. Nothing in the form or your saved routine changed.");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!proposal) return;
    onApply(proposal);
    setApplied(true);
  }

  return (
    <section className="mt-5 rounded-2xl border border-[#9DCFC3] bg-[#F2FBF9] p-4" aria-labelledby="routine-copilot-title">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white p-2 text-[#087F72]"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h3 id="routine-copilot-title" className="font-bold text-[#041B2D]">Organize label or schedule text</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Paste exactly what your current label or instructions say. LVE360 will organize the wording for your review without choosing or changing any instruction.</p>
        </div>
      </div>
      <label className="mt-4 block text-sm font-bold text-[#041B2D]">
        Label or instruction text
        <textarea value={sourceText} onChange={(event) => { setSourceText(event.target.value); setProposal(null); setApplied(false); }} rows={3} maxLength={1200} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-[#087F72] focus:ring-2 focus:ring-[#087F72]/20" placeholder="For example, take 10 mg once weekly on Sunday at 8:00 AM" />
      </label>
      <button type="button" disabled={busy || sourceText.trim().length < 3} onClick={() => void organize()} className="mt-3 inline-flex min-h-12 items-center justify-center rounded-xl border border-[#087F72] bg-white px-4 py-3 font-bold text-[#06695F] hover:bg-[#EAFBF8] disabled:opacity-60">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />}
        Organize these instructions
      </button>
      {error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p> : null}
      {proposal ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#087F72]">Proposed organization</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-bold text-[#041B2D]">Name copied from text</dt><dd className="mt-0.5 text-slate-700">{proposal.name ?? existingName ?? "Not found"}</dd></div>
            <div><dt className="font-bold text-[#041B2D]">Amount copied from text</dt><dd className="mt-0.5 text-slate-700">{proposal.dose ?? "Not found"}</dd></div>
            <div className="sm:col-span-2"><dt className="font-bold text-[#041B2D]">Checklist schedule</dt><dd className="mt-0.5 text-slate-700">{proposal.schedule ? regimenScheduleLabel(proposal.schedule) : "Not ready"}</dd></div>
          </dl>
          <p className="mt-3 text-sm leading-6 text-slate-600">{proposal.explanation}</p>
          {proposal.questions.length ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="flex items-center font-bold"><AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" /> Check before saving</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">{proposal.questions.map((question) => <li key={question}>{question}</li>)}</ul>
            </div>
          ) : null}
          <button type="button" onClick={apply} className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-4 py-3 font-bold text-white hover:bg-[#06695F]">
            <Check className="mr-2 h-4 w-4" aria-hidden="true" /> Apply to form
          </button>
          <p className="mt-2 text-xs leading-5 text-slate-500">{applied ? "Applied for your review. It is still not saved." : "Nothing is saved until you apply this proposal and use the form’s Save or Add button."}</p>
        </div>
      ) : null}
    </section>
  );
}
