import Link from "next/link";

import { InvitationRequestForm } from "./InvitationRequestForm";

export default function RequestInvitationPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <section className="space-y-5 lg:sticky lg:top-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Private membership</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Request an invitation to LVE360.</h1>
          <p className="text-lg leading-8 text-slate-600">LVE360 is being prepared for a small, founder-reviewed group. Tell us what you want help organizing and we’ll review the fit personally.</p>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm leading-6 text-sky-950">
            The free LVE360 Blueprint remains available to everyone. You do not need an invitation to use it.
            <div className="mt-3"><Link className="font-semibold underline underline-offset-4" href="/blueprint">Open the free Blueprint</Link></div>
          </div>
          <p className="text-sm leading-6 text-slate-500">Existing members can continue to <Link className="font-medium text-slate-800 underline underline-offset-4" href="/login">log in</Link>.</p>
        </section>
        <InvitationRequestForm />
      </div>
    </main>
  );
}
