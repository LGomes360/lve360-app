import Link from "next/link";

import { requireTier } from "@/app/_auth/requireTier";
import { groupRoutineItems, ROUTINE_SECTION_LABELS, ROUTINE_SECTION_ORDER, routineInstructionAuthorityLabel, routineScheduleLabel } from "@/lib/routine";
import { getRoutineData } from "@/lib/routineData";
import { doseIntegrityIssue } from "@/lib/doseIntegrity";

import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RoutinePrintPage() {
  const { user } = await requireTier(["premium", "trial"], { next: "/routine/print" });
  const data = await getRoutineData(user.id);
  const grouped = groupRoutineItems(data.items);
  const generatedAt = new Date();

  return (
    <article className="mx-auto max-w-4xl rounded-2xl bg-white p-5 shadow-sm print:max-w-none print:rounded-none print:p-0 print:shadow-none sm:p-8">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-300 pb-5 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <Link href="/routine" className="inline-flex min-h-12 items-center font-bold text-[#087F72]">Back to Routine</Link>
        <PrintButton />
      </div>

      <header className="border-b-2 border-[#041B2D] pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">LVE360 member record</p>
        <h1 className="mt-2 text-3xl font-extrabold text-[#041B2D]">Current regimen for clinician review</h1>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="font-bold text-[#041B2D]">Generated</dt><dd>{formatDateTime(generatedAt)}</dd></div>
          <div><dt className="font-bold text-[#041B2D]">Current items</dt><dd>{grouped.current.length}</dd></div>
        </dl>
        <p className="mt-4 text-sm leading-6 text-slate-700">
          This list reflects information recorded by the member. It is provided to support review and reconciliation. LVE360 does not prescribe, change, or verify medication, hormone, or supplement instructions.
        </p>
      </header>

      <div className="mt-6 space-y-7">
        {ROUTINE_SECTION_ORDER.map((kind) => {
          const items = grouped.byKind[kind];
          if (!items.length) return null;
          return (
            <section key={kind} className="break-inside-avoid" aria-labelledby={`print-${kind}`}>
              <h2 id={`print-${kind}`} className="border-b border-slate-300 pb-2 text-xl font-bold text-[#041B2D]">{ROUTINE_SECTION_LABELS[kind]}</h2>
              <div className="mt-3 space-y-3">
                {items.map((item) => {
                  const authority = routineInstructionAuthorityLabel(item.instruction_authority);
                  const doseIssue = doseIntegrityIssue(item.name, item.dose);
                  return (
                    <div key={item.id} className="break-inside-avoid rounded-xl border border-slate-300 p-4 print:rounded-none">
                      <h3 className="text-lg font-bold text-[#041B2D]">{item.name}</h3>
                      {item.brand ? <p className="mt-1 text-sm text-slate-700">Brand: {item.brand}</p> : null}
                      <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        <div><dt className="font-bold">Recorded amount at each scheduled time</dt><dd>{item.dose?.trim() || "Not recorded"}</dd></div>
                        <div><dt className="font-bold">Recorded schedule</dt><dd>{routineScheduleLabel(item)}</dd></div>
                        <div><dt className="font-bold">Instruction source</dt><dd>{authority || "Not recorded"}</dd></div>
                        <div><dt className="font-bold">Last updated</dt><dd>{item.updated_at ? formatDate(item.updated_at) : "Not available"}</dd></div>
                        {item.purpose ? <div className="sm:col-span-2"><dt className="font-bold">Purpose reported by member</dt><dd>{item.purpose}</dd></div> : null}
                      </dl>
                      {doseIssue ? <p className="mt-3 border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">Member confirmation needed: {doseIssue.message}</p> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-8 break-inside-avoid border-t border-slate-300 pt-5">
        <h2 className="text-lg font-bold text-[#041B2D]">Clinician or pharmacist notes</h2>
        <div className="mt-3 h-28 border-b border-dashed border-slate-400" />
        <div className="mt-4 h-10 border-b border-dashed border-slate-400" />
      </section>
    </article>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
}
