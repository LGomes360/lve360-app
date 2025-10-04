"use client";

import Link from "next/link";
import { motion } from "framer-motion";

/**
 * Home Page — LVE360
 * Palette:
 *  - Teal:    #06C1A0
 *  - Purple:  #7C3AED (tailwind purple-600), with soft #D9C2F0 tints
 *  - Navy:    #041B2D
 * Background gradients use soft blends of #EAFBF8 (teal tint) and #F8F5FB (purple tint)
 * All primary CTAs go to the Tally quiz.
 */

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
};
const springy = {
  whileHover: { scale: 1.04 },
  transition: { type: "spring" as const, stiffness: 220, damping: 16 },
};


export default function Home() {
  return (
    <main className="relative isolate overflow-hidden">
      {/* ---------- Ambient Background (subtle, non-distracting) ---------- */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full
                   bg-[#A8F0E4] opacity-30 blur-3xl animate-[float_8s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-[18rem] -right-24 h-[28rem] w-[28rem] rounded-full
                   bg-[#D9C2F0] opacity-30 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />

      {/* ================================================================== */}
      {/* 1) HERO                                                            */}
      {/* ================================================================== */}
           <motion.section
        className="relative z-0 bg-gradient-to-b from-[#EAFBF8] via-white to-[#F8F5FB]"
        initial="initial"
        animate="animate"
        variants={fadeUp}
        transition={{ duration: 0.55 }}
      >
        <div className="max-w-6xl mx-auto px-6 pt-20 sm:pt-28 pb-16 text-center">
          {/* Tagline pill */}
          <div className="inline-flex items-center gap-2 rounded-full bg-white/75 ring-1 ring-gray-200 px-4 py-1.5 mb-6 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-[#06C1A0]" />
            <span className="text-sm text-gray-700">
              Personalized insights for Longevity • Vitality • Energy
            </span>
          </div>
      
          {/* Title */}
          <h1
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text
                       bg-gradient-to-r from-[#041B2D] via-[#06C1A0] to-purple-600 drop-shadow-sm"
          >
            Welcome to LVE360
          </h1>
      
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
            Your personalized health optimization platform — assessed with AI,
            organized in plain English, and ready to act on.
          </p>
      
          {/* Inline quiz embed */}
          <div className="mt-12 flex justify-center">
            <iframe
              src="https://tally.so/r/mOqRBk?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1"
              width="100%"
              height="600"
              className="max-w-2xl w-full rounded-2xl shadow-lg border border-gray-200"
              frameBorder="0"
              title="LVE360 Quiz"
            ></iframe>
          </div>
      
          {/* Login hint */}
          <p className="mt-8 text-sm text-gray-600">
            Already a member?{" "}
            <Link href="/login" className="text-purple-600 font-medium hover:underline">
              Log in →
            </Link>
          </p>
      
          {/* Credibility cards */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            {[
              { icon: "⚖️", text: "DSHEA-aligned supplement guidance" },
              { icon: "⚡", text: "Actionable, not overwhelming" },
              { icon: "🧠", text: "AI-driven, guided by wellness experts" },
            ].map((item) => (
              <motion.div
                key={item.text}
                whileHover={springy.whileHover}
                transition={springy.transition}
                className="rounded-xl bg-white/80 ring-1 ring-gray-200 px-4 py-3 backdrop-blur text-gray-700
                           hover:bg-white/90 transition-colors"
              >
                <span className="mr-2">{item.icon}</span>
                {item.text}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>


      {/* ================================================================== */}
      {/* 2) HOW IT WORKS                                                    */}
      {/* ================================================================== */}
      <motion.section
        className="max-w-6xl mx-auto px-6 py-16 text-center"
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={fadeUp}
        transition={{ duration: 0.55 }}
      >
        <h2 className="text-3xl sm:text-4xl font-bold text-[#041B2D] mb-12">
          How It Works
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            {
              step: "1",
              title: "Take the Quiz",
              desc: "5 minutes to share your health goals and background.",
              accent: "text-purple-600",
            },
            {
              step: "2",
              title: "Get Your Free Report",
              desc: "Receive your supplement & lifestyle blueprint.",
              accent: "text-[#06C1A0]",
            },
            {
              step: "3",
              title: "Optional: Upgrade",
              desc: "Premium unlocks weekly tweaks & your dashboard.",
              accent: "text-yellow-500",
            },
          ].map((s) => (
            <motion.div
              key={s.step}
              {...springy}
              className="rounded-2xl bg-white shadow p-6"
            >
              <div className={`text-2xl font-bold ${s.accent} mb-2`}>Step {s.step}</div>
              <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
              <p className="text-gray-600">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ================================================================== */}
      {/* 3) SOCIAL PROOF                                                    */}
      {/* ================================================================== */}
      <motion.section
        className="bg-gradient-to-br from-white via-[#F8F5FB] to-[#EAFBF8] py-16"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55 }}
      >
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-[#041B2D] mb-8">What People Are Saying</h2>
          <div className="space-y-6">
            {[
              "“This made supplements finally make sense.” — Early Beta Tester",
              "“I stopped wasting money on random pills and actually feel a difference.”",
              "“Finally, a plan that adapts to me instead of a one-size-fits-all.”",
            ].map((t, i) => (
              <p key={i} className="italic text-gray-700">⭐ {t}</p>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ================================================================== */}
      {/* 4) WHO IT'S FOR                                                    */}
      {/* ================================================================== */}
      <motion.section
        className="max-w-6xl mx-auto px-6 py-16 text-center"
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={fadeUp}
        transition={{ duration: 0.55 }}
      >
        <h2 className="text-3xl font-bold text-[#041B2D] mb-10">Who It’s For</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: "🧬", title: "Longevity Enthusiasts", accent: "text-[#06C1A0]" },
            { icon: "⏱️", title: "Busy Professionals", accent: "text-purple-600" },
            { icon: "🎯", title: "Goal-Driven Optimizers", accent: "text-yellow-500" },
          ].map((p) => (
            <motion.div
              key={p.title}
              {...springy}
              className="rounded-xl bg-white p-6 shadow hover:shadow-md transition"
            >
              <div className={`text-3xl mb-3 ${p.accent}`}>{p.icon}</div>
              <h3 className="font-semibold">{p.title}</h3>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ================================================================== */}
      {/* 5) FREE vs PREMIUM                                                 */}
      {/* ================================================================== */}
      <motion.section
        className="py-16 bg-gradient-to-br from-[#F8F5FB] via-white to-[#EAFBF8]"
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={fadeUp}
        transition={{ duration: 0.55 }}
      >
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-[#041B2D] mb-8">Free vs Premium</h2>
          <div className="grid sm:grid-cols-2 gap-8">
            {/* Free */}
            <div className="rounded-xl border border-gray-200 bg-white/85 backdrop-blur p-6 shadow-sm hover:shadow-md transition">
              <h3 className="font-semibold mb-3 text-gray-700">Free</h3>
              <ul className="text-left text-gray-600 space-y-2">
                <li>✓ Personalized Report</li>
                <li>✓ Contraindications</li>
                <li>✓ Bang-for-Buck Picks</li>
                <li className="text-gray-400">✗ Weekly Tweaks</li>
                <li className="text-gray-400">✗ Dashboard</li>
              </ul>
            </div>

            {/* Premium */}
            <div className="rounded-xl border-2 border-purple-600 bg-white/90 backdrop-blur p-6 shadow-lg hover:shadow-xl transition">
              <h3 className="font-semibold mb-3 text-purple-600">Premium</h3>
              <ul className="text-left text-gray-700 space-y-2">
                <li>✓ Everything in Free</li>
                <li>✓ Weekly Tweaks</li>
                <li>✓ Lifestyle Notes</li>
                <li>✓ Dashboard Access</li>
              </ul>
              <div className="text-left mt-4">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 text-purple-600 font-medium hover:underline"
                >
                  Learn about Premium →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ================================================================== */}
      {/* 6) TRUSTED & SECURE (badges)                                      */}
      {/* ================================================================== */}
      <motion.section
        className="max-w-6xl mx-auto px-6 py-16 text-center"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55 }}
      >
        <h2 className="text-3xl font-bold text-[#041B2D] mb-6">Trusted & Secure</h2>
        <p className="max-w-2xl mx-auto text-gray-600 mb-8">
          We use well-supported infrastructure for auth, payments, and content delivery.
        </p>
        <div className="flex flex-wrap justify-center gap-8 opacity-95">
          <div className="px-4 py-2 bg-white rounded-lg shadow-sm ring-1 ring-gray-200 font-semibold text-[#635BFF]">
            Stripe
          </div>
          <div className="px-4 py-2 bg-white rounded-lg shadow-sm ring-1 ring-gray-200 font-semibold text-[#3ECF8E]">
            Supabase
          </div>
          <div className="px-4 py-2 bg-white rounded-lg shadow-sm ring-1 ring-gray-200 font-semibold text-gray-700">
            DSHEA
          </div>
          <div className="px-4 py-2 bg-white rounded-lg shadow-sm ring-1 ring-gray-200 font-semibold text-[#FF9900]">
            Amazon
          </div>
          <div className="px-4 py-2 bg-white rounded-lg shadow-sm ring-1 ring-gray-200 font-semibold">
            GitHub
          </div>
        </div>
      </motion.section>

      {/* ================================================================== */}
      {/* 7) DASHBOARD PREVIEW (placeholders for now)                        */}
      {/* ================================================================== */}
      <motion.section
        className="bg-gradient-to-br from-white via-[#EAFBF8] to-[#F8F5FB] py-16 text-center"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55 }}
      >
        <h2 className="text-3xl font-bold text-[#041B2D] mb-6">See Your Dashboard</h2>
        <p className="text-gray-600 max-w-2xl mx-auto mb-8">
          A simple snapshot of your progress, weekly tweaks, and curated stack.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-8">
          <div className="h-64 w-40 bg-white/80 ring-1 ring-gray-200 rounded-lg shadow-inner backdrop-blur" />
          <div className="h-64 w-96 bg-white/80 ring-1 ring-gray-200 rounded-lg shadow-inner backdrop-blur" />
        </div>
      </motion.section>

      {/* ================================================================== */}
      {/* 8) WHAT MAKES US DIFFERENT                                         */}
      {/* ================================================================== */}
      <motion.section
        className="max-w-6xl mx-auto px-6 py-16 text-center"
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={fadeUp}
        transition={{ duration: 0.55 }}
      >
        <h2 className="text-3xl font-bold text-[#041B2D] mb-6">What Makes Us Different</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: "📖", text: "Transparent Evidence", accent: "text-purple-600" },
            { icon: "🧬", text: "Personalized to You", accent: "text-[#06C1A0]" },
            { icon: "✨", text: "Concierge-feel (MVP)", accent: "text-yellow-500" },
          ].map((d) => (
            <motion.div
              key={d.text}
              {...springy}
              className="rounded-xl bg-white/90 backdrop-blur p-6 shadow hover:shadow-md transition"
            >
              <div className={`text-3xl mb-2 ${d.accent}`}>{d.icon}</div>
              <p className="text-gray-700">{d.text}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ================================================================== */}
      {/* 9) FAQ                                                             */}
      {/* ================================================================== */}
      <motion.section
        className="bg-gradient-to-br from-[#F8F5FB] via-white to-[#EAFBF8] py-16"
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={fadeUp}
        transition={{ duration: 0.55 }}
      >
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-[#041B2D] mb-8 text-center">FAQ</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-xl bg-white/90 backdrop-blur p-6 ring-1 ring-gray-200 shadow-sm">
              <h3 className="font-semibold text-[#041B2D] mb-2">Is the quiz really free?</h3>
              <p className="text-gray-600">
                Yep. You’ll get a personalized report at no cost. Premium is optional.
              </p>
            </div>
            <div className="rounded-xl bg-white/90 backdrop-blur p-6 ring-1 ring-gray-200 shadow-sm">
              <h3 className="font-semibold text-[#041B2D] mb-2">What’s included in Premium?</h3>
              <p className="text-gray-600">
                Weekly tweaks, lifestyle notes, and dashboard access to track your progress.
              </p>
            </div>
            <div className="rounded-xl bg-white/90 backdrop-blur p-6 ring-1 ring-gray-200 shadow-sm">
              <h3 className="font-semibold text-[#041B2D] mb-2">Do you store medical records?</h3>
              <p className="text-gray-600">
                No medical records; we keep things focused on supplements & lifestyle.
              </p>
            </div>
            <div className="rounded-xl bg-white/90 backdrop-blur p-6 ring-1 ring-gray-200 shadow-sm">
              <h3 className="font-semibold text-[#041B2D] mb-2">Can I cancel anytime?</h3>
              <p className="text-gray-600">
                Yes. You can manage or cancel your subscription in the Stripe customer portal.
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ================================================================== */}
      {/* 10) STICKY CTA                                                     */}
      {/* ================================================================== */}
      <motion.section
        className="bg-purple-600 text-white py-16 text-center"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55 }}
      >
        <h2 className="text-3xl font-bold mb-4">Ready to Start?</h2>
        <p className="mb-6">
          Take the quiz now and get your free personalized report in minutes.
        </p>
        <a
          href="https://tally.so/r/mOqRBk"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white text-purple-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50"
        >
          <span>Start Free Quiz</span> <span>→</span>
        </a>
      </motion.section>
    </main>
  );
}
