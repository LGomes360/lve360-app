"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { track } from "@vercel/analytics/react";
import CTAButton from "@/components/CTAButton";
import IntakeModal from "@/components/intake/IntakeModal";
import { trackProductEvent } from "@/lib/productAnalyticsClient";

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
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-700">Free clarity. Ongoing guidance when you want it.</p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#041b2d] sm:text-5xl">Start with a free Blueprint. Upgrade for a system that adapts with you.</h1>
        <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-600">Your free Blueprint organizes the health picture you share. Membership turns that snapshot into a living daily system that helps answer three recurring questions: What matters now? Why this? What is working?</p>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl gap-7 md:grid-cols-2">
        <section className="flex flex-col rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-wider text-slate-500">Personalized snapshot</p>
          <h2 className="mt-1 text-2xl font-bold text-[#041b2d]">Free Blueprint</h2>
          <p className="mt-2 text-slate-600">Know where you stand before you commit.</p>
          <p className="mt-7 text-4xl font-extrabold text-[#041b2d]">$0</p>
          <ul className="mt-7 flex-1 space-y-4 text-left text-slate-700">
            <li>✓ Goals, routines, stack, and health context organized</li>
            <li>✓ Prioritized personalized Blueprint</li>
            <li>✓ Evidence and safety context</li>
            <li>✓ Lifestyle foundations and starting-point ideas</li>
          </ul>
          <CTAButton onClick={openIntake} variant="secondary" fullWidth className="mt-8">Get your free Blueprint</CTAButton>
          <p className="mt-4 text-center text-xs leading-5 text-slate-500">A dated report based on the information you provide. No purchase required.</p>
        </section>

        <section className="relative flex flex-col rounded-3xl border-2 border-[#06a98e] bg-white p-8 shadow-xl shadow-teal-900/10">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06a98e] px-3 py-1 text-sm font-semibold text-white">Living decision system</span>
          <h2 className="text-2xl font-bold text-[#041b2d]">LVE360 Membership</h2>
          <p className="mt-2 text-slate-600">Know what to do next and why it fits you.</p>
          <ul className="mt-7 flex-1 space-y-4 text-left text-slate-700">
            <li>✓ Everything in Free</li>
            <li>✓ One prioritized daily action with a clear reason</li>
            <li>✓ Weekly practice with a smaller version for hard days</li>
            <li>✓ Routine, reminders, and optional check-ins</li>
            <li>✓ Progress reviews that inform what comes next</li>
            <li>✓ Ask LVE360 coaching grounded in your saved record</li>
          </ul>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <CTAButton onClick={() => selectPlan("monthly")} variant="primary" fullWidth>$15 / month</CTAButton>
            <CTAButton onClick={() => selectPlan("annual")} variant="secondary" fullWidth className="bg-amber-300 text-slate-900 hover:bg-amber-400">$100 / year</CTAButton>
          </div>
          <p className="mt-3 text-center text-sm text-slate-500">Annual membership saves $80 per year and costs less than $2 per week. Cancel anytime.</p>
          <p className="mt-2 text-center text-xs leading-5 text-slate-500">You will sign in or create access with the email you want attached to your membership.</p>
        </section>
      </div>

      <section className="mx-auto mt-20 max-w-5xl">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-700">Why membership stays useful</p>
          <h2 className="mt-3 text-3xl font-bold text-[#041b2d]">What LVE360 knows, decides, and learns</h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            ["Knows your context", "Your goals, routines, medications, supplements, preferences, and saved changes stay connected in one record."],
            ["Decides what matters now", "LVE360 uses that context to surface a realistic next action and explain the facts behind it."],
            ["Learns from what you record", "Check-ins, completions, and weekly reviews create evidence that helps the system keep future guidance relevant."],
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
            ["A focused loop", "One daily priority, a clear weekly practice, and a useful review. It is not an endless list of tasks."],
            ["A grounded second look", "Ask questions using the health record you saved, with evidence limits and clear guidance about when to involve a clinician."],
            ["Not medical care", "LVE360 is educational wellness guidance. It does not diagnose, treat, or replace a clinician or healthcare provider."],
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
            ["3", "Open your dashboard", "After confirmation, return to LVE360 and see the next action connected to your goals and current plan."],
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
          <p className="mt-3">
            You can cancel from <strong className="text-white">Settings &gt; Manage Billing</strong>. Before joining,
            review our <Link href="/terms" className="font-semibold text-teal-300 underline decoration-teal-300/50 underline-offset-4">Terms</Link>,{" "}
            <Link href="/privacy" className="font-semibold text-teal-300 underline decoration-teal-300/50 underline-offset-4">Privacy Policy</Link>, and{" "}
            <Link href="/medical-disclaimer" className="font-semibold text-teal-300 underline decoration-teal-300/50 underline-offset-4">Medical Disclaimer</Link>.
          </p>
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
