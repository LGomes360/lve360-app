"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import CTAButton from "@/components/CTAButton";

const intakeUrl = "https://tally.so/r/mOqRBk?hideTitle=1&transparentBackground=1&dynamicHeight=1";

function IntakeModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const onMouseDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose(); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown); document.addEventListener("mousedown", onMouseDown);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKeyDown); document.removeEventListener("mousedown", onMouseDown); };
  }, [onClose]);
  return <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true"><motion.div ref={ref} className="relative w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl" initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }}><button onClick={onClose} className="absolute right-4 top-3 z-10 rounded-full px-3 py-1 text-xl text-slate-500 hover:bg-slate-100" aria-label="Close intake">×</button><iframe src={intakeUrl} title="LVE360 intake" className="min-h-[84vh] w-full" /></motion.div></motion.div>;
}

export default function Pricing() {
  const [email, setEmail] = useState("");
  const [showIntake, setShowIntake] = useState(false);
  const [submitting, setSubmitting] = useState<"monthly" | "annual" | null>(null);

  useEffect(() => { const value = new URLSearchParams(window.location.search).get("email"); if (value) setEmail(value); }, []);

  async function subscribe(plan: "monthly" | "annual") {
    if (!email) { alert("Enter the email you want to use for your membership."); return; }
    setSubmitting(plan);
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, plan }) });
      const data = await response.json();
      if (!response.ok || !data?.url) throw new Error(data?.error || "Checkout failed. Try again.");
      window.location.href = data.url;
    } catch (error) { alert(error instanceof Error ? error.message : "Checkout failed. Try again."); setSubmitting(null); }
  }

  return <main className="relative overflow-hidden bg-gradient-to-b from-[#eafbf8] via-white to-[#f8f5fb] px-6 pb-20 pt-28">
    <div className="mx-auto max-w-5xl text-center">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-700">LVE360 membership</p>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#041b2d] sm:text-5xl">Turn your Blueprint into a healthier way of living.</h1>
      <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-600">Start free with clarity about your health and supplement plan. Join when you want a focused weekly system that helps small, meaningful actions become part of who you are.</p>
    </div>

    <div className="mx-auto mt-14 grid max-w-5xl gap-7 md:grid-cols-2">
      <section className="flex flex-col rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-[#041b2d]">Free Blueprint</h2>
        <p className="mt-2 text-slate-600">Get clarity before you commit.</p>
        <p className="mt-7 text-4xl font-extrabold text-[#041b2d]">$0</p>
        <ul className="mt-7 flex-1 space-y-4 text-left text-slate-700"><li>✓ Current stack and context review</li><li>✓ Prioritized personalized Blueprint</li><li>✓ Evidence and safety context</li><li>✓ Lifestyle foundations and next-step ideas</li></ul>
        <CTAButton onClick={() => setShowIntake(true)} variant="secondary" fullWidth className="mt-8">Get your free Blueprint</CTAButton>
      </section>

      <section className="relative flex flex-col rounded-3xl border-2 border-[#06a98e] bg-white p-8 shadow-xl shadow-teal-900/10">
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06a98e] px-3 py-1 text-sm font-semibold text-white">For the weekly practice</span>
        <h2 className="text-2xl font-bold text-[#041b2d]">Membership</h2>
        <p className="mt-2 text-slate-600">Keep the right next action visible.</p>
        <ul className="mt-7 flex-1 space-y-4 text-left text-slate-700"><li>✓ Everything in Free</li><li>✓ One focused weekly practice</li><li>✓ Today’s active plan and optional check-ins</li><li>✓ Progress view and ongoing plan updates</li><li>✓ Blueprint and PDF access in one place</li></ul>
        <label className="mt-7 block text-left text-sm font-semibold text-slate-700" htmlFor="membership-email">Email for membership</label>
        <input id="membership-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-teal-500 transition focus:ring-2" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CTAButton onClick={() => subscribe("monthly")} variant="primary" fullWidth disabled={submitting !== null}>{submitting === "monthly" ? "Opening checkout…" : "$15 / month"}</CTAButton>
          <CTAButton onClick={() => subscribe("annual")} variant="secondary" fullWidth className="bg-amber-300 text-slate-900 hover:bg-amber-400" disabled={submitting !== null}>{submitting === "annual" ? "Opening checkout…" : "$100 / year"}</CTAButton>
        </div>
        <p className="mt-3 text-center text-sm text-slate-500">Annual membership saves $80 per year. Cancel anytime.</p>
      </section>
    </div>

    <section className="mx-auto mt-20 max-w-5xl">
      <h2 className="text-center text-3xl font-bold text-[#041b2d]">What membership is and is not</h2>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {[
          ["A focused loop", "A clear weekly practice, a lightweight check-in, and a review of progress. It is not an endless list of tasks."],
          ["A grounded second look", "Organize your stack and questions so you can make better-informed decisions and know when to involve a clinician."],
          ["Not medical care", "LVE360 is educational wellness guidance. It does not diagnose, treat, or replace a clinician or pharmacist."],
        ].map(([title, description]) => <article key={title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h3 className="font-bold text-[#041b2d]">{title}</h3><p className="mt-3 leading-7 text-slate-600">{description}</p></article>)}
      </div>
    </section>

    <div className="mx-auto mt-16 text-center"><Link href="/" className="font-semibold text-teal-700 hover:text-teal-900">← Back to LVE360</Link><p className="mt-5 text-sm text-slate-500">Payments are processed securely by Stripe.</p></div>
    <AnimatePresence>{showIntake && <IntakeModal onClose={() => setShowIntake(false)} />}</AnimatePresence>
  </main>;
}
