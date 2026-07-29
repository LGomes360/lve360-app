import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({
  eyebrow = "LVE360",
  title,
  description,
  updated,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-gradient-to-b from-[#EAFBF8] via-white to-white px-5 pb-20 pt-32">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#047F6D]">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#041B2D]">{title}</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated {updated}</p>
        <p className="mt-7 leading-7 text-slate-700">{description}</p>
        <div className="mt-9 space-y-9 leading-7 text-slate-700 [&_a]:font-semibold [&_a]:text-[#047F6D] [&_a]:underline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#041B2D] [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-3 [&_ul]:space-y-2 [&_p+p]:mt-3">
          {children}
        </div>
        <div className="mt-10 border-t border-slate-200 pt-6">
          <Link href="/" className="font-semibold text-[#047F6D] hover:underline">
            Return to LVE360
          </Link>
        </div>
      </article>
    </div>
  );
}
