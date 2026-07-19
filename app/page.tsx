"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

const intakeUrl = "https://tally.so/r/mOqRBk?hideTitle=1&transparentBackground=1&dynamicHeight=1";

function IntakeModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const onPointerDown = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) onClose();
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:p-8"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true"
    >
      <motion.div
        ref={modalRef}
        className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
      >
        <button onClick={onClose} className="absolute right-4 top-3 z-10 rounded-full px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close intake">×</button>
        <iframe src={intakeUrl} title="LVE360 intake" className="min-h-[84vh] w-full bg-white" />
      </motion.div>
    </motion.div>
  );
}

export default function Home() {
  const [showIntake, setShowIntake] = useState(false);
  const openIntake = () => setShowIntake(true);

  return (
    <main className="overflow-hidden bg-white text-slate-900">
      <section className="relative isolate bg-gradient-to-b from-[#eafbf8] via-white to-[#f8f5fb] px-6 pb-20 pt-28 sm:pb-28 sm:pt-36">
        <div className="absolute -left-28 top-8 -z-10 h-80 w-80 rounded-full bg-teal-200/50 blur-3xl" />
        <div className="absolute -right-24 top-24 -z-10 h-96 w-96 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="mx-auto max-w-5xl text-center">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.18em] text-teal-700">Your personal operating system for better health</p>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight text-[#041b2d] sm:text-6xl">
            Build a healthier, more energized life—one focused week at a time.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">
            LVE360 reviews your goals, supplement stack, medications, and routines to create a personalized Blueprint—then helps you turn it into small, repeatable actions across sleep, nutrition, movement, focus, and relationships.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button onClick={openIntake} className="rounded-xl bg-[#06a98e] px-6 py-3.5 font-semibold text-white shadow-lg shadow-teal-700/20 transition hover:bg-[#048b75]">Get your free Blueprint</button>
            <Link href="/pricing" className="rounded-xl px-6 py-3.5 font-semibold text-[#041b2d] transition hover:bg-white/80">See how membership works</Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">Start free. No purchase required for your Blueprint.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-[#041b2d] sm:text-4xl">From knowing what to do to becoming someone who does it</h2>
          <p className="mt-4 text-lg text-slate-600">Big goals can inspire you, but lasting change is built through small actions you can repeat. LVE360 helps you choose the next useful action and build from there.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["1", "Understand your starting point", "Share your goals, current stack, medications, and context. Get a personalized Blueprint with priorities, evidence notes, and clinician-review flags when needed."],
            ["2", "Practice one meaningful change", "Turn a big goal—such as weight loss, sleep, strength, or better nutrition—into one small action that fits this week."],
            ["3", "Become the person who follows through", "Each completed practice is evidence of the healthier identity you are building. Review what worked, adjust, and let small wins compound."],
          ].map(([number, title, description]) => (
            <article key={number} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 font-bold text-teal-700">{number}</span>
              <h3 className="mt-5 text-xl font-bold text-[#041b2d]">{title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#041b2d] px-6 py-20 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-300">Where intention becomes action</p>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">Your Blueprint shows the direction. Your weekly practice moves you forward.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-300">LVE360 membership keeps change manageable when motivation fluctuates: one visible next action, a quick check-in, and a record of the small wins that compound over time.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["This week", "One practice connected to your priority—not an overwhelming reset."],
              ["Today’s plan", "Keep your active supplement and lifestyle actions in one practical view."],
              ["Daily check-in", "Log a quick signal such as sleep or energy, only when it is useful."],
              ["Progress review", "See consistency over time and decide what deserves adjustment."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-white/15 bg-white/10 p-5">
                <h3 className="font-bold text-teal-200">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-violet-700">A more credible kind of optimization</p>
            <h2 className="mt-4 text-3xl font-bold text-[#041b2d]">Sometimes the best next move is to simplify.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">LVE360 is not built to sell you more pills. It helps you organize what you already use, surface potential duplication or questions to discuss with a clinician, and concentrate on the few changes worth your attention.</p>
          </div>
          <ul className="grid content-start gap-4">
            {[
              "A structured record of your current stack and priorities",
              "Evidence-aware recommendations with clear limits and safety context",
              "One focused weekly practice instead of a sprawling protocol",
              "A practical dashboard for momentum, not perfection",
            ].map((item) => <li key={item} className="rounded-xl bg-slate-50 px-5 py-4 font-medium text-slate-700">✓ {item}</li>)}
          </ul>
        </div>
      </section>

      <section className="bg-gradient-to-br from-violet-50 via-white to-teal-50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-[#041b2d] sm:text-4xl">Start with the decision you need today</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">Free gives you the Blueprint. Membership helps you return to it, act on it, and adapt as your life changes.</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
              <h3 className="text-xl font-bold text-[#041b2d]">Free Blueprint</h3>
              <p className="mt-2 text-slate-600">A clear first look at your stack and the priorities that deserve attention.</p>
              <ul className="mt-6 space-y-3 text-slate-700"><li>✓ Current stack review</li><li>✓ Prioritized Blueprint recommendations</li><li>✓ Evidence and safety context</li><li>✓ Lifestyle foundations to discuss or try</li></ul>
              <button onClick={openIntake} className="mt-7 font-semibold text-teal-700 hover:text-teal-900">Get your free Blueprint →</button>
            </div>
            <div className="rounded-2xl border-2 border-[#06a98e] bg-white p-7 shadow-lg">
              <p className="text-sm font-bold uppercase tracking-wider text-teal-700">Membership</p>
              <h3 className="mt-1 text-xl font-bold text-[#041b2d]">Make insight easier to repeat</h3>
              <p className="mt-2 text-slate-600">A home for the focused practices and reviews that make your plan usable week after week.</p>
              <ul className="mt-6 space-y-3 text-slate-700"><li>✓ Everything in Free</li><li>✓ Weekly focus and action plan</li><li>✓ Daily plan and optional check-ins</li><li>✓ Progress view and ongoing updates</li></ul>
              <Link href="/pricing" className="mt-7 inline-block font-semibold text-teal-700 hover:text-teal-900">Explore membership →</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-[#041b2d]">A healthier life is built from small choices repeated.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">Start with a free, personalized Blueprint. Choose one meaningful action. Build a week you can repeat.</p>
        <button onClick={openIntake} className="mt-8 rounded-xl bg-violet-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-violet-700/20 transition hover:bg-violet-700">Start your free Blueprint</button>
        <p className="mx-auto mt-5 max-w-xl text-xs leading-5 text-slate-500">LVE360 provides educational wellness information, not medical diagnosis or treatment. Consult a qualified clinician or pharmacist for medical decisions.</p>
      </section>

      <AnimatePresence>{showIntake && <IntakeModal onClose={() => setShowIntake(false)} />}</AnimatePresence>
    </main>
  );
}
