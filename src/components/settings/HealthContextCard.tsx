import Link from "next/link";
import { ArrowUpRight, BedDouble, Brain, Dumbbell, FlaskConical, ShieldCheck, Utensils } from "lucide-react";

const domains = [
  {
    icon: BedDouble,
    title: "Sleep",
    detail: "Duration, consistency, and how restorative it felt.",
  },
  {
    icon: Dumbbell,
    title: "Exercise",
    detail: "Movement and workout context without turning every day into a score.",
  },
  {
    icon: Utensils,
    title: "Diet & weight",
    detail: "Weight trends plus the eating context you choose to describe. Diet quality is never inferred from weight.",
  },
  {
    icon: Brain,
    title: "Overall feeling",
    detail: "Energy, stress, mood, and emotional wellbeing only as you describe them.",
  },
  {
    icon: FlaskConical,
    title: "Lab balance",
    detail: "Member-approved trends from verified lab reports, retaining collection dates, units, and the source laboratory’s reference ranges. Not a diagnosis.",
  },
] as const;

export default function HealthContextCard() {
  return (
    <section id="health-context" aria-labelledby="health-context-title" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[#EAFBF8] p-2 text-[#047F6D]"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#047F6D]">Member-controlled handoff</p>
          <h2 id="health-context-title" className="mt-1 text-lg font-bold text-[#041B2D]">ChatGPT Health + LVE360</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            ChatGPT Health can analyze information you connect there. LVE360 will accept only a short summary you review and approve, then use it to shape one daily focus and longer-term follow-through.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {domains.map(({ icon: Icon, title, detail }) => (
          <div key={title} className={`rounded-xl border border-slate-200 bg-slate-50 p-4 ${title === "Lab balance" ? "sm:col-span-2" : ""}`}>
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-[#047F6D]" aria-hidden="true" />
              <h3 className="font-bold text-[#041B2D]">{title}</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
          </div>
        ))}
      </div>

      <ol className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <li className="rounded-xl bg-[#F4FAF8] p-4"><strong className="text-[#041B2D]">1. Understand</strong><span className="mt-1 block leading-6 text-slate-600">Ask ChatGPT Health to review the five areas over a clear time window.</span></li>
        <li className="rounded-xl bg-[#F4FAF8] p-4"><strong className="text-[#041B2D]">2. Review</strong><span className="mt-1 block leading-6 text-slate-600">See the exact summary before anything leaves ChatGPT.</span></li>
        <li className="rounded-xl bg-[#F4FAF8] p-4"><strong className="text-[#041B2D]">3. Approve</strong><span className="mt-1 block leading-6 text-slate-600">Choose whether to send that summary to your LVE360 account.</span></li>
        <li className="rounded-xl bg-[#F4FAF8] p-4"><strong className="text-[#041B2D]">4. Follow through</strong><span className="mt-1 block leading-6 text-slate-600">LVE360 turns the approved context into one priority and preserves what happens next.</span></li>
      </ol>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        The direct handoff is not connected yet. LVE360 cannot see your ChatGPT Health information unless you explicitly approve a future handoff. Raw medical records and raw Apple Health samples remain out of scope.
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <a href="https://chatgpt.com" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#047F6D] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#036c5d]">
          Open ChatGPT <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </a>
        <Link href="/consumer-health-data-privacy" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-[#041B2D] hover:bg-slate-50">
          Review LVE360 health-data controls
        </Link>
      </div>
    </section>
  );
}
