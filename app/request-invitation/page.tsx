import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Request an invitation",
  description: "Learn about requesting private access to the LVE360 health workspace.",
};

export default function RequestInvitationPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#FCFBF8] px-6 pb-20 pt-32 text-slate-900 sm:pt-40">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_#DDF5EF_0,_transparent_42%),radial-gradient(circle_at_top_right,_#F5E7C8_0,_transparent_40%)]" />
      <section className="mx-auto max-w-3xl rounded-3xl border border-[#E7D8B5] bg-white/90 p-8 text-center shadow-xl shadow-slate-900/5 backdrop-blur sm:p-12">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#A06A13]">Private access</p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#041B2D] sm:text-5xl">The door is intentionally small.</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">
          LVE360 is preparing a short invitation request for people who want help keeping their health, routines, and progress organized. Requests will open after the founder completes the product readiness gate.
        </p>
        <div className="mt-9 rounded-2xl border border-teal-100 bg-[#EFFAF7] p-5 text-left">
          <h2 className="font-bold text-[#041B2D]">What you can do now</h2>
          <p className="mt-2 leading-7 text-slate-600">The free Blueprint is open now and does not require private access or payment. It gives you a useful personalized starting point based on the information you choose to share.</p>
        </div>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/#blueprint" className="rounded-xl bg-[#087F72] px-6 py-3.5 font-semibold text-white transition hover:bg-[#06695F]">Explore the free Blueprint</Link>
          <Link href="/login" className="rounded-xl border border-slate-300 bg-white px-6 py-3.5 font-semibold text-[#041B2D] transition hover:bg-slate-50">Existing member login</Link>
        </div>
        <p className="mt-6 text-sm leading-6 text-slate-500">An invitation request does not guarantee access or imply a specific opening date.</p>
      </section>
    </main>
  );
}
