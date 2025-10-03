"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <main className="relative isolate overflow-hidden bg-gradient-to-b from-[#EAFBF8] via-white to-[#F8F5FB]">
      {/* ---------------- Background Blobs ---------------- */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full
                   bg-[#A8F0E4] opacity-30 blur-3xl animate-[float_8s_ease-in-out_infinite]"
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
                       bg-gradient-to-r from-purple-600 via-[#06C1A0] to-purple-700 drop-shadow-sm">
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
          <Link href="/login" className="text-[#06C1A0] font-medium hover:underline">
            Log in →
          </Link>
        </p>
      </motion.section>

      {/* ---------------- Credibility Cards ---------------- */}
      <section className="max-w-6xl mx-auto px-6 py-12 text-center">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            { icon: "⚖️", text: "DSHEA-compliant (supplements)" },
            { icon: "⚡", text: "Actionable, not overwhelming" },
            { icon: "🧠", text: "AI-driven personalization" },
          ].map((item) => (
            <div
              key={item.text}
              className="rounded-xl bg-white/80 ring-1 ring-gray-200 px-4 py-3 backdrop-blur text-gray-700
                         hover:bg-white transition-colors shadow-sm"
            >
              <span className="mr-2">{item.icon}</span>
              {item.text}
            </div>
          ))}
        </div>
      </section>

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
            { step: "3", title: "Unlock Premium", desc: "Upgrade for weekly tweaks, dashboard & concierge access." },
          ].map((s) => (
            <div key={s.step} className="rounded-2xl bg-white shadow p-6">
              <div className="text-2xl font-bold text-purple-600 mb-2">Step {s.step}</div>
              <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
              <p className="text-gray-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ---------------- Social Proof ---------------- */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-[#041B2D] mb-8">What People Are Saying</h2>
          <div className="space-y-6">
            {[
              "“This made supplements finally make sense.” – Early Beta Tester",
              "“I stopped wasting money on random pills and actually feel a difference.”",
              "“Finally, a plan that adapts to me instead of a one-size-fits-all.”",
            ].map((t, i) => (
              <p key={i} className="italic text-gray-700">⭐ {t}</p>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Who It’s For ---------------- */}
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-[#041B2D] mb-10">Who It’s For</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: "🧬", title: "Longevity Enthusiasts" },
            { icon: "⚡", title: "Busy Professionals" },
            { icon: "💎", title: "Health Optimizers" },
          ].map((p) => (
            <div key={p.title} className="rounded-xl bg-white p-6 shadow hover:shadow-md transition">
              <div className="text-3xl mb-3">{p.icon}</div>
              <h3 className="font-semibold">{p.title}</h3>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Free vs Premium ---------------- */}
      <section className="bg-[#F8F5FB] py-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-[#041B2D] mb-8">Free vs Premium</h2>
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold mb-3 text-gray-700">Free</h3>
              <ul className="text-left text-gray-600 space-y-2">
                <li>✓ Personalized Report</li>
                <li>✓ Contraindications</li>
                <li>✓ Bang-for-Buck Picks</li>
                <li className="text-gray-400">✗ Weekly Tweaks</li>
                <li className="text-gray-400">✗ Dashboard</li>
              </ul>
            </div>
            <div className="rounded-xl border-2 border-purple-500 bg-white p-6 shadow-lg">
              <h3 className="font-semibold mb-3 text-purple-600">Premium</h3>
              <ul className="text-left text-gray-700 space-y-2">
                <li>✓ Everything in Free</li>
                <li>✓ Weekly Tweaks</li>
                <li>✓ Lifestyle Notes</li>
                <li>✓ Dashboard Access</li>
                <li>✓ Concierge Upgrade Option</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Differentiators ---------------- */}
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-[#041B2D] mb-6">What Makes Us Different</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: "📖", text: "Evidence-based" },
            { icon: "🧬", text: "Personalized to you" },
            { icon: "🤝", text: "Concierge-ready" },
          ].map((d) => (
            <div key={d.text} className="rounded-xl bg-white p-6 shadow">
              <div className="text-3xl mb-2">{d.icon}</div>
              <p>{d.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Trusted + Preview ---------------- */}
      <section className="bg-gray-50 py-16 text-center">
        <h2 className="text-3xl font-bold text-[#041B2D] mb-6">Trusted & Secure</h2>
        <div className="flex justify-center gap-10 opacity-70 mb-12">
          <div className="h-12 w-28 rounded bg-gray-100 ring-1 ring-gray-200 flex items-center justify-center">Stripe</div>
          <div className="h-12 w-28 rounded bg-gray-100 ring-1 ring-gray-200 flex items-center justify-center">Supabase</div>
          <div className="h-12 w-28 rounded bg-gray-100 ring-1 ring-gray-200 flex items-center justify-center">DSHEA</div>
        </div>
        <h3 className="text-xl font-semibold mb-4">See Your Dashboard</h3>
        <div className="flex flex-col sm:flex-row justify-center gap-8">
          <div className="h-64 w-40 bg-gray-200 rounded-lg shadow-inner" />
          <div className="h-64 w-96 bg-gray-200 rounded-lg shadow-inner" />
        </div>
      </section>

      {/* ---------------- Bottom CTA ---------------- */}
      <section className="bg-gradient-to-r from-purple-600 to-[#06C1A0] text-white py-16 text-center">
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
      </section>
    </main>
  );
}
