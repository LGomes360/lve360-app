"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";

import IntakeModal from "@/components/intake/IntakeModal";
import { useProductMode } from "@/components/ProductModeProvider";
import { trackProductEvent } from "@/lib/productAnalyticsClient";

type HomeExperienceProps = {
  openIntake: () => void;
};

const privateWorkspaceFeatures = [
  ["Today", "See what deserves your attention now."],
  ["Your plan", "Keep health routines and priorities organized."],
  ["Journey", "Notice what is changing over time."],
  ["Routine", "Keep medications, supplements, hormones, and timing in view."],
  ["Ask LVE360", "Explore your saved information with grounded AI support."],
  ["Reports", "Bring your health information together when you need it."],
] as const;

function PrivateHomeExperience({ openIntake }: HomeExperienceProps) {
  return (
    <main className="overflow-hidden bg-[#FCFBF8] text-slate-900">
      <section className="relative isolate px-6 pb-24 pt-32 sm:pb-32 sm:pt-40">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top_left,_#DDF5EF_0,_transparent_42%),radial-gradient(circle_at_top_right,_#F5E7C8_0,_transparent_38%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-36 bg-gradient-to-b from-transparent to-[#FCFBF8]" />
        <div className="mx-auto max-w-5xl text-center">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-[#087F72]">A private health workspace for a life well lived</p>
          <h1 className="mx-auto max-w-4xl text-5xl font-extrabold tracking-tight text-[#041B2D] sm:text-7xl">
            More good years. More energy in them.
          </h1>
          <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">
            LVE360 brings your goals, routines, health information, and progress into one calm place, so your health can support the life you want to live.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button type="button" onClick={openIntake} className="rounded-xl bg-[#087F72] px-6 py-3.5 font-semibold text-white shadow-lg shadow-teal-900/15 transition hover:bg-[#06695F]">
              Explore your free Blueprint
            </button>
            <Link href="/request-invitation" className="rounded-xl border border-[#C99A43] bg-white/70 px-6 py-3.5 font-semibold text-[#664A17] transition hover:bg-[#FFF7E7]">
              Request an invitation
            </Link>
          </div>
          <p className="mt-5 text-sm text-slate-500">
            LVE360 is currently private. Already inside?{" "}
            <Link href="/login" className="font-semibold text-[#087F72] hover:text-[#06695F]">Log in</Link>.
          </p>
        </div>
      </section>

      <section id="philosophy" className="scroll-mt-24 px-6 py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#A06A13]">Our philosophy</p>
            <h2 className="mt-4 text-3xl font-bold text-[#041B2D] sm:text-5xl">Health should give you more life, not become your life.</h2>
          </div>
          <div className="space-y-5 text-lg leading-8 text-slate-600">
            <p>LVE360 exists to reduce the friction of staying engaged with your health. It helps keep the information you choose to share organized, useful, and connected to what matters to you.</p>
            <p>Longevity gives you more years. Vitality helps those years feel good. Energy lets you use them for family, work, movement, adventure, relationships, and ordinary days worth enjoying.</p>
          </div>
        </div>
      </section>

      <section id="blueprint" className="scroll-mt-24 bg-[#041B2D] px-6 py-20 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#E8C779]">The front room is open</p>
            <h2 className="mt-4 text-3xl font-bold sm:text-5xl">Start with your free Blueprint.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              Share only what you choose. Your Blueprint organizes your goals, routines, medications, supplements, and health context into a personalized starting point with evidence and safety notes.
            </p>
            <button type="button" onClick={openIntake} className="mt-8 rounded-xl bg-[#06A98E] px-6 py-3.5 font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-[#078873]">
              Build my free Blueprint
            </button>
            <p className="mt-4 text-sm text-slate-400">No payment required. An invitation is not required.</p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur sm:p-9">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal-200">A genuine starting point</p>
            <ul className="mt-6 space-y-4 text-slate-100">
              <li className="flex gap-3"><span className="text-[#E8C779]">01</span><span>Your current health and routine context, organized</span></li>
              <li className="flex gap-3"><span className="text-[#E8C779]">02</span><span>Prioritized observations and lifestyle foundations</span></li>
              <li className="flex gap-3"><span className="text-[#E8C779]">03</span><span>Evidence, safety notes, and questions for a clinician</span></li>
              <li className="flex gap-3"><span className="text-[#E8C779]">04</span><span>A useful report you can keep and revisit</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section id="inside-lve360" className="scroll-mt-24 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#087F72]">Inside LVE360</p>
            <h2 className="mt-4 text-3xl font-bold text-[#041B2D] sm:text-5xl">A quiet workspace that helps you keep moving.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">The private workspace carries your Blueprint forward without turning health into another full-time job.</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {privateWorkspaceFeatures.map(([title, description]) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-bold text-[#041B2D]">{title}</h3>
                <p className="mt-2 leading-7 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-br from-[#F5E7C8] via-[#FFFDF8] to-[#DDF5EF] px-6 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#A06A13]">Private access</p>
          <h2 className="mt-4 text-3xl font-bold text-[#041B2D] sm:text-5xl">The door is intentionally small.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            LVE360 is being developed privately. Ongoing workspace access is offered selectively while the experience continues to be refined. If it sounds useful to you, you can ask to be considered.
          </p>
          <Link href="/request-invitation" className="mt-8 inline-flex rounded-xl bg-[#041B2D] px-6 py-3.5 font-semibold text-white shadow-lg transition hover:bg-[#0B304B]">
            Request an invitation
          </Link>
          <p className="mt-5 text-sm text-slate-500">No public membership plans. No sales pitch. A request does not guarantee access.</p>
        </div>
      </section>

      <section className="px-6 py-16 text-center">
        <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-500">
          LVE360 provides educational wellness information, not medical diagnosis or treatment. Review health decisions with a qualified clinician or healthcare provider.
        </p>
      </section>
    </main>
  );
}

function PublicPaidHomeExperience({ openIntake }: HomeExperienceProps) {
  return (
    <main className="overflow-hidden bg-white text-slate-900">
      <section className="relative isolate bg-gradient-to-b from-[#eafbf8] via-white to-[#f8f5fb] px-6 pb-20 pt-28 sm:pb-28 sm:pt-36">
        <div className="absolute -left-28 top-8 -z-10 h-80 w-80 rounded-full bg-teal-200/50 blur-3xl" />
        <div className="absolute -right-24 top-24 -z-10 h-96 w-96 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="mx-auto max-w-5xl text-center">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.18em] text-teal-700">Personalized guidance for everyday health decisions</p>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight text-[#041b2d] sm:text-6xl">Know what matters today. Build better health over time.</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">LVE360 brings your goals, routines, supplements, medications, and health context into one clear system. Start with a free Blueprint. Membership helps you choose the next useful action, understand why it matters, and learn from what happens.</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button type="button" onClick={openIntake} className="rounded-xl bg-[#06a98e] px-6 py-3.5 font-semibold text-white shadow-lg shadow-teal-700/20 transition hover:bg-[#048b75]">Build my free Blueprint</button>
            <Link href="/pricing" className="rounded-xl px-6 py-3.5 font-semibold text-[#041b2d] transition hover:bg-white/80">See membership</Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">Start free. No purchase required for your Blueprint.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-700">A system that gets more useful with use</p>
          <h2 className="mt-3 text-3xl font-bold text-[#041b2d] sm:text-4xl">Clarity is useful. Knowing what to do next is better.</h2>
          <p className="mt-4 text-lg text-slate-600">LVE360 connects your bigger health goals to one realistic decision at a time, then uses your recorded experience to keep the guidance relevant.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["1", "Knows your context", "Your goals, routines, current stack, medications, preferences, and saved changes form one organized health record."],
            ["2", "Decides what matters now", "LVE360 connects that record to your priorities and surfaces one useful action with a clear reason and a smaller version for hard days."],
            ["3", "Learns from real life", "Your check-ins, completed practices, and weekly reviews create evidence about what fits, what helps, and what should change next."],
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
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-300">The daily decision layer</p>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">Open LVE360 and know where to put your energy.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-300">Membership turns a dated health report into a living system. Today connects your current plan, weekly focus, routines, and recent progress so the next step feels clear and achievable.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["One priority", "See the action most worth your attention today, without turning health into another full-time job."],
              ["A reason you can trust", "Understand the saved facts and personal goals behind the suggestion."],
              ["A doable version", "Keep moving on hard days with a minimum version that still counts."],
              ["A feedback loop", "Record what happened, review the week, and use that evidence to choose what comes next."],
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
              <p className="text-sm font-bold uppercase tracking-wider text-slate-500">A personalized snapshot</p>
              <h3 className="mt-1 text-xl font-bold text-[#041b2d]">Free Blueprint</h3>
              <p className="mt-2 text-slate-600">Understand your starting point and the priorities that deserve attention.</p>
              <ul className="mt-6 space-y-3 text-slate-700"><li>✓ Organized health and routine context</li><li>✓ Prioritized Blueprint recommendations</li><li>✓ Evidence and safety context</li><li>✓ Lifestyle foundations to consider</li></ul>
              <button type="button" onClick={openIntake} className="mt-7 font-semibold text-teal-700 hover:text-teal-900">Get your free Blueprint →</button>
            </div>
            <div className="rounded-2xl border-2 border-[#06a98e] bg-white p-7 shadow-lg">
              <p className="text-sm font-bold uppercase tracking-wider text-teal-700">A living decision system</p>
              <h3 className="mt-1 text-xl font-bold text-[#041b2d]">LVE360 Membership</h3>
              <p className="mt-2 text-slate-600">Turn your Blueprint into one clear daily priority and a plan that evolves with you.</p>
              <ul className="mt-6 space-y-3 text-slate-700"><li>✓ Everything in Free</li><li>✓ One prioritized action and why it matters</li><li>✓ Weekly practice, routine, and reminders</li><li>✓ Check-ins, progress reviews, and grounded coaching</li></ul>
              <Link href="/pricing" className="mt-7 inline-block font-semibold text-teal-700 hover:text-teal-900">Explore membership →</Link>
            </div>
          </div>
        </div>
      </section>
      <section className="bg-gradient-to-br from-violet-50 via-white to-teal-50 px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-[#041b2d] sm:text-4xl">Start with clarity. Keep going with a system that knows you.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">Build your free Blueprint today. When you are ready, membership helps turn that insight into better decisions across sleep, nutrition, movement, focus, relationships, and the life you want to build.</p>
        <button type="button" onClick={openIntake} className="mt-8 rounded-xl bg-violet-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-violet-700/20 transition hover:bg-violet-700">Start your free Blueprint</button>
        <p className="mx-auto mt-5 max-w-xl text-xs leading-5 text-slate-500">LVE360 provides educational wellness information, not medical diagnosis or treatment. Consult a qualified clinician or healthcare provider for medical decisions.</p>
      </section>
    </main>
  );
}

export default function Home() {
  const [showIntake, setShowIntake] = useState(false);
  const { accessMode } = useProductMode();

  useEffect(() => {
    trackProductEvent({ event_name: "homepage_viewed", source: "homepage" });
  }, []);

  function openIntake() {
    trackProductEvent({ event_name: "intake_started", source: "homepage" });
    setShowIntake(true);
  }

  return (
    <>
      {accessMode === "invite_only"
        ? <PrivateHomeExperience openIntake={openIntake} />
        : <PublicPaidHomeExperience openIntake={openIntake} />}
      <AnimatePresence>{showIntake ? <IntakeModal onClose={() => setShowIntake(false)} /> : null}</AnimatePresence>
    </>
  );
}
