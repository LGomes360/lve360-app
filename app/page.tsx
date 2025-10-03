"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <main className="relative isolate overflow-hidden">
      {/* Animated background blobs */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full
                   bg-[#A8F0E4] opacity-40 blur-3xl animate-[float_8s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-24 -right-24 h-[28rem] w-[28rem] rounded-full
                   bg-[#D9C2F0] opacity-30 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />

      {/* ---------------- Hero Section ---------------- */}
      <motion.section
        className="max-w-6xl mx-auto px-6 pt-20 sm:pt-28 pb-16 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Tagline pill */}
        <div className="inline-flex items-center gap-2 rounded-full bg-white/70 ring-1 ring-gray-200 px-4 py-1.5 mb-6 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#06C1A0]" />
          <span className="text-sm text-gray-700">
            Concierge insights for Longevity • Vitality • Energy
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text
                       bg-gradient-to-r from-purple-600 via-[#06C1A0] to-[#041B2D] drop-shadow-sm">
          Welcome to LVE360
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
          Your personalized health optimization platform — assessed with AI,
          organized in plain English, and ready to act on.
        </p>

        <div className="mt-10 flex justify-center">
          <a
            href="https://tally.so/r/mOqRBk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl
                       bg-purple-600 text-white px-7 py-3 font-semibold
                       shadow-[0_10px_25px_rgba(128,0,128,0.35)]
                       transition-all hover:shadow-[0_14px_34px_rgba(128,0,128,0.45)]
                       focus-visible:ring-4 focus-visible:ring-purple-500/30 relative overflow-hidden"
          >
            🚀 Start Free Quiz
          </a>
        </div>

        <p className="mt-6 text-sm text-gray-600">
          Already a member?{" "}
          <Link href="/login" className="text-purple-600 font-medium hover:underline">
            Log in →
          </Link>
        </p>

        {/* Credibility cards */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            { icon: "⚖️", text: "DSHEA-compliant (supplements)" },
            { icon: "⚡", text: "Actionable, not overwhelming" },
            { icon: "🧠", text: "AI-driven, guided by wellness experts" },
          ].map((item) => (
            <motion.div
              key={item.text}
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 200, damping: 12 }}
              className="rounded-xl bg-white/70 ring-1 ring-gray-200 px-4 py-3 backdrop-blur text-gray-700
                         hover:bg-white/90 transition-colors"
            >
              <span className="mr-2">{item.icon}</span>
              {item.text}
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ---------------- How It Works ---------------- */}
      <motion.section
        className="max-w-6xl mx-auto px-6 py-16 text-center"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-3xl sm:text-4xl font-bold text-[#041B2D] mb-12">
          How It Works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { step: "1", title: "Take the Quiz", desc: "5 minutes to share your health goals and background." },
            { step: "2", title: "Get Your Free Report", desc: "Your supplement & lifestyle blueprint, evidence-based." },
            { step: "3", title: "Unlock Premium", desc: "Upgrade for weekly tweaks, dashboard & concierge-feel." },
          ].map((s) => (
            <motion.div
              key={s.step}
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 200, damping: 12 }}
              className="rounded-2xl bg-white shadow p-6"
            >
              <div className="text-2xl font-bold text-purple-600 mb-2">Step {s.step}</div>
              <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
              <p className="text-gray-600">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ---------------- Free vs Premium ---------------- */}
      <motion.section
        className="py-16 bg-gradient-to-br from-[#F8F5FB] via-white to-[#EAFBF8]"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-[#041B2D] mb-8">Free vs Premium</h2>
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="rounded-xl border border-gray-200 bg-white/80 backdrop-blur p-6 shadow-sm hover:shadow-md transition">
              <h3 className="font-semibold mb-3 text-gray-700">Free</h3>
              <ul className="text-left text-gray-600 space-y-2">
                <li>✓ Personalized Report</li>
                <li>✓ Contraindications</li>
                <li>✓ Bang-for-Buck Picks</li>
                <li className="text-gray-400">✗ Weekly Tweaks</li>
                <li className="text-gray-400">✗ Dashboard</li>
              </ul>
            </div>
            <div className="rounded-xl border-2 border-purple-600 bg-white/90 backdrop-blur p-6 shadow-lg hover:shadow-xl transition">
              <h3 className="font-semibold mb-3 text-purple-600">Premium</h3>
              <ul className="text-left text-gray-700 space-y-2">
                <li>✓ Everything in Free</li>
                <li>✓ Weekly Tweaks</li>
                <li>✓ Lifestyle Notes</li>
                <li>✓ Dashboard Access</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ---------------- Differentiators ---------------- */}
      <motion.section
        className="py-16 bg-gradient-to-br from-white via-[#F8F5FB] to-[#EAFBF8]"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-[#041B2D] mb-6">What Makes Us Different</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { icon: "📖", text: "Transparent Evidence", accent: "text-purple-600" },
              { icon: "🧬", text: "Personalized to you", accent: "text-[#06C1A0]" },
              { icon: "✨", text: "Concierge-feel", accent: "text-yellow-500" },
            ].map((d) => (
              <motion.div
                key={d.text}
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 200, damping: 12 }}
                className="rounded-xl bg-white/90 backdrop-blur p-6 shadow hover:shadow-md transition"
              >
                <div className={`text-3xl mb-2 ${d.accent}`}>{d.icon}</div>
                <p className="text-gray-700">{d.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ---------------- Trusted & Secure ---------------- */}
      <motion.section
        className="max-w-6xl mx-auto px-6 py-16 text-center"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-3xl font-bold text-[#041B2D] mb-6">Trusted & Secure</h2>
        <div className="flex flex-wrap justify-center gap-8 opacity-90">
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
          <div className="px-4 py-2 bg-white rounded-lg shadow-sm ring-1 ring-gray-200 font-semibold text-black">
            GitHub
          </div>
        </div>
      </motion.section>

      {/* ---------------- Sticky CTA ---------------- */}
      <motion.section
        className="bg-purple-600 text-white py-16 text-center"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-3xl font-bold mb-4">Ready to Start?</h2>
        <p className="mb-6">Take the quiz now and get your free personalized report in minutes.</p>
        <a
          href="https://tally.so/r/mOqRBk"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white text-purple-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50"
        >
          Start Free Quiz →
        </a>
      </motion.section>
    </main>
  );
}
