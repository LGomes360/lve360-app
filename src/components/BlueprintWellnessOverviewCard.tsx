import Link from "next/link";
import type { BlueprintWellnessOverview } from "@/lib/blueprintWellnessOverview";

export default function BlueprintWellnessOverviewCard({ overview }: { overview: BlueprintWellnessOverview }) {
  return (
    <section className="mt-6 rounded-2xl border border-[#9DCFC3] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="blueprint-wellness-title">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Five-area context · As of {overview.asOfDate}</p>
      <h2 id="blueprint-wellness-title" className="mt-1 text-2xl font-bold text-[#041B2D]">Your wellness picture, beyond supplements</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">This read-only overview uses your latest available records. It is separate from the original dated report and PDF below. Historical records are not live sync or a reading of how you feel today.</p>
      {overview.priorities.length ? <p className="mt-3 text-sm leading-6 text-slate-700"><strong>Recorded priorities:</strong> {overview.priorities.join(" · ")}. Priorities do not establish current symptoms or progress.</p> : null}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {overview.areas.map((area) => (
          <article key={area.key} className="rounded-xl border border-slate-200 bg-[#F8FCFB] p-4">
            <h3 className="text-lg font-bold text-[#041B2D]">{area.label}</h3>
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#087F72]">Dated source context</p>
            {area.records.length ? <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">{area.records.map((record, index) => <li key={index}>{record}</li>)}</ul> : <p className="mt-2 text-sm leading-6 text-slate-600">No dated source context is available for this area.</p>}
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">What this tells us about today</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{area.today}</p>
          </article>
        ))}
      </div>
      <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">{overview.routineNote}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/today#health-picture-title" className="inline-flex min-h-11 items-center rounded-xl border border-[#9DCFC3] px-4 py-2 text-sm font-bold text-[#06695F] hover:bg-[#EAFBF8]">Review dated source details</Link>
        <Link href="/today" className="inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-4 py-2 text-sm font-bold text-white hover:bg-[#06695F]">Share today&apos;s perspective</Link>
      </div>
    </section>
  );
}
