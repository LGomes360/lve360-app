"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, BedDouble, Brain, Dumbbell, FlaskConical, Loader2, ShieldCheck, Trash2, Utensils } from "lucide-react";

import type { ApprovedHealthContextHandoff } from "@/lib/healthContextHandoff";

const domains = [
  { icon: BedDouble, title: "Sleep", detail: "Duration, consistency, and how restorative it felt." },
  { icon: Dumbbell, title: "Exercise", detail: "Movement and workout context without turning every day into a score." },
  { icon: Utensils, title: "Diet & weight", detail: "Weight trends plus the eating context you choose to describe. Diet quality is never inferred from weight." },
  { icon: Brain, title: "Overall feeling", detail: "Energy, stress, mood, and emotional wellbeing only as you describe them." },
  { icon: FlaskConical, title: "Lab balance", detail: "Member-approved trends from verified lab reports, retaining collection dates, units, and the source laboratory’s reference ranges. Not a diagnosis." },
] as const;

export default function HealthContextCard() {
  const [handoff, setHandoff] = useState<ApprovedHealthContextHandoff | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/health-context-handoff", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { ok?: boolean; handoff?: ApprovedHealthContextHandoff | null };
        if (!response.ok || !body.ok) throw new Error("handoff_unavailable");
        if (active) setHandoff(body.handoff ?? null);
      })
      .catch(() => { if (active) setMessage("Handoff status is temporarily unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function removeHandoff() {
    if (!handoff || !window.confirm("Remove this approved health summary from LVE360?")) return;
    setDeleting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/health-context-handoff", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: handoff.id }),
      });
      if (!response.ok) throw new Error("delete_failed");
      setHandoff(null);
      setMessage("The approved handoff was removed from LVE360.");
    } catch {
      setMessage("LVE360 could not remove the handoff. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section id="health-context" aria-labelledby="health-context-title" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[#EAFBF8] p-2 text-[#047F6D]"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#047F6D]">Private founder pilot</p>
          <h2 id="health-context-title" className="mt-1 text-lg font-bold text-[#041B2D]">ChatGPT Health + LVE360</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            ChatGPT Health can analyze information you connect there. LVE360 accepts only a short summary you review and approve, then uses it to inform one daily focus and longer-term follow-through.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {domains.map(({ icon: Icon, title, detail }) => (
          <div key={title} className={`rounded-xl border border-slate-200 bg-slate-50 p-4 ${title === "Lab balance" ? "sm:col-span-2" : ""}`}>
            <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#047F6D]" aria-hidden="true" /><h3 className="font-bold text-[#041B2D]">{title}</h3></div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
          </div>
        ))}
      </div>

      <ol className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <li className="rounded-xl bg-[#F4FAF8] p-4"><strong className="text-[#041B2D]">1. Understand</strong><span className="mt-1 block leading-6 text-slate-600">Ask ChatGPT Health to review the five areas over a clear time window.</span></li>
        <li className="rounded-xl bg-[#F4FAF8] p-4"><strong className="text-[#041B2D]">2. Review</strong><span className="mt-1 block leading-6 text-slate-600">See the exact summary before anything leaves ChatGPT.</span></li>
        <li className="rounded-xl bg-[#F4FAF8] p-4"><strong className="text-[#041B2D]">3. Approve</strong><span className="mt-1 block leading-6 text-slate-600">Choose whether to send that summary to your LVE360 account.</span></li>
        <li className="rounded-xl bg-[#F4FAF8] p-4"><strong className="text-[#041B2D]">4. Follow through</strong><span className="mt-1 block leading-6 text-slate-600">LVE360 keeps the approved context visible while you act on one priority.</span></li>
      </ol>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Checking your handoff status…</p>
        ) : handoff ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[#041B2D]">Latest approved handoff: {formatDate(handoff.snapshotDate)}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Source window {formatDate(handoff.sourceWindow.start)}–{formatDate(handoff.sourceWindow.end)}. The Today page can now use this bounded context.</p>
            </div>
            <button type="button" onClick={removeHandoff} disabled={deleting} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />}
              Remove handoff
            </button>
          </div>
        ) : (
          <p className="text-sm leading-6 text-slate-600">No approved handoff is saved yet. When the founder connection is enabled in ChatGPT, nothing will be stored until you approve the exact five-area summary.</p>
        )}
        {message ? <p className="mt-2 text-sm font-medium text-slate-700" role="status">{message}</p> : null}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <a href="https://chatgpt.com" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#047F6D] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#036c5d]">
          Open ChatGPT <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </a>
        <Link href="/consumer-health-data-privacy" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-[#041B2D] hover:bg-slate-50">Review LVE360 health-data controls</Link>
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00.000Z`));
}
