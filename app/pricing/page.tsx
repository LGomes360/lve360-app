"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { track } from "@vercel/analytics/react";
import CTAButton from "@/components/CTAButton";
import { trackProductEvent } from "@/lib/productAnalyticsClient";

const intakeUrl = "https://tally.so/r/mOqRBk?hideTitle=1&transparentBackground=1&dynamicHeight=1";

function IntakeModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose]);

  return (
    <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true">
      <motion.div ref={ref} className="relative w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl" initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }}>
        <button onClick={onClose} className="absolute right-4 top-3 z-10 rounded-full px-3 py-1 text-xl text-slate-500 hover:bg-slate-100" aria-label="Close intake">×</button>
        <iframe src={intakeUrl} title="LVE360 intake" className="min-h-[84vh] w-full" />
      </motion.div>
    </motion.div>
  );
}

export default function Pricing() {
  const router = useRouter();
  const [showIntake, setShowIntake] = useState(false);

  useEffect(() => trackProductEvent({ event_name: "pricing_viewed", source: "pricing" }), []);

  function openIntake() {
    trackProductEvent({ event_name: "intake_started", source: "pricing" });
    setShowIntake(true);
  }

  function selectPlan(plan: "monthly" | "annual") {
    track("Plan Selected", { plan, source: "pricing" });
    router.push(`/upgrade?plan=${plan}`);
  }

  return (
    <main className="relative overflow-hidden bg-gradient-to-b from-[#eafbf8] via-white to-[#f8f5fb] px-6 pb-20 pt-28">
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
          <ul className="mt-7 flex-1 space-y-4 text-left text-slate-700">
            <li>✓ Current stack and context review</li>
            <li>✓ Prioritized personalized Blueprint</li>
            <li>✓ Evidence and safety context</li>
            <li>✓ Lifestyle foundations and next-step ideas</li>
          </ul>
          <CTAButton onClick={openIntake} variant="secondary" fullWidth className="mt-8">Get your free Blueprint</CTAButton>
        </section>

        <section className="relative flex flex-col rounded-3xl border-2 border-[#06a98e] bg-white p-8 shadow-xl shadow-teal-900/10">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06a98e] px-3 py-1 text-sm font-semibold text-white">For the weekly practice</span>
          <h2 className="text-2xl font-bold text-[#041b2d]">Membership</h2>
          <p className="mt-2 text-slate-600">Keep the right next action visible.</p>
          <ul className="mt-7 flex-1 space-y-4 text-left text-slate-700">
            <li>✓ Everything in Free</li>
            <li>✓ One focused weekly practice</li>
            <li>✓ Today&apos;s active plan and optional check-ins</li>
            <li>✓ Progress view and ongoing plan updates</li>
            <li>✓ Blueprint and PDF access in one place</li>
          </ul>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <CTAButton onClick={() => selectPlan("monthly")} variant="primary" fullWidth>$15 / month</CTAButton>
            <CTAButton onClick={() => selectPlan("annual")} variant="secondary" fullWidth className="bg-amber-300 text-slate-900 hover:bg-amber-400">$100 / year</CTAButton>
          </div>
          <p className="mt-3 text-center text-sm text-slate-500">Annual membership saves $80 per year. Cancel anytime.</p>
          <p className="mt-2 text-center text-xs leading-5 text-slate-500">You will sign in or create access with the email you want attached to your membership.</p>
        </section>
      </div>

      <section className="mx-auto mt-20 max-w-5xl">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-700">Your first seven days</p>
          <h2 className="mt-3 text-3xl font-bold text-[#041b2d]">Start small. Learn what works. Build from there.</h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            ["Day 1", "Bring your Blueprint into the dashboard and choose one weekly practice that supports the person you want to become."],
            ["Days 2 to 6", "Keep that action visible in Today's Plan and use short check-ins when they help you notice patterns."],
            ["Day 7", "Review what happened, recognize the progress you made, and adjust your next focus without starting over."],
          ].map(([title, description]) => (
            <article key={title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-bold text-[#041b2d]">{title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-5xl">
        <h2 className="text-center text-3xl font-bold text-[#041b2d]">What membership is and is not</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            ["A focused loop", "A clear weekly practice, a lightweight check-in, and a review of progress. It is not an endless list of tasks."],
            ["A grounded second look", "Organize your stack and questions so you can make better-informed decisions and know when to involve a clinician."],
            ["Not medical care", "LVE360 is educational wellness guidance. It does not diagnose, treat, or replace a clinician or pharmacist."],
          ].map(([title, description]) => (
            <article key={title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-bold text-[#041b2d]">{title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-5xl rounded-3xl bg-[#041b2d] p-8 text-white sm:p-10">
        <h2 className="text-center text-3xl font-bold">What happens after you choose a plan</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ["1", "Sign in", "Use the email you want connected to your LVE360 membership."],
            ["2", "Check out securely", "Choose monthly or annual billing and complete payment through Stripe."],
            ["3", "Open your dashboard", "After confirmation, return to LVE360 and begin your first weekly practice."],
          ].map(([number, title, description]) => (
            <article key={number}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-400 font-bold text-[#041b2d]">{number}</div>
              <h3 className="mt-4 font-bold">{title}</h3>
              <p className="mt-2 leading-7 text-slate-300">{description}</p>
            </article>
          ))}
        </div>
        <div className="mt-9 rounded-2xl bg-white/10 p-5 text-sm leading-6 text-slate-200">
          <p><strong className="text-white">Your health information stays out of checkout.</strong> Stripe receives the account and billing details needed to process payment. Your supplement, medication, and health-profile answers are not sent to Stripe.</p>
          <p className="mt-3">You can cancel from <strong className="text-white">Account &gt; Manage Billing</strong>. Read our <Link href="/privacy" className="font-semibold text-teal-300 underline decoration-teal-300/50 underline-offset-4">Privacy Policy</Link>.</p>
        </div>
      </section>

      <div className="mx-auto mt-16 text-center">
        <Link href="/" className="font-semibold text-teal-700 hover:text-teal-900">← Back to LVE360</Link>
        <p className="mt-5 text-sm text-slate-500">Payments are processed securely by Stripe.</p>
      </div>
      <AnimatePresence>{showIntake && <IntakeModal onClose={() => setShowIntake(false)} />}</AnimatePresence>
    </main>
  );
}
