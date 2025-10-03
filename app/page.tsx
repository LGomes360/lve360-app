"use client";

import Link from "next/link";
import { motion } from "framer-motion";

// Simple reusable fade-in animation
const FadeInWhenVisible = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.6 }}
  >
    {children}
  </motion.div>
);

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
                   bg-[#06C1A0] opacity-20 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />

      {/* ---------------- Hero Section ---------------- */}
      <section className="max-w-6xl mx-auto px-6 pt-20 sm:pt-28 pb-16 text-center">
        <FadeInWhenVisible>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/70 ring-1 ring-gray-200 px-4 py-1.5 mb-6 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-[#06C1A0]" />
            <span className="text-sm text-gray-700">
              Concierge insights for Longevity • Vitality • Energy
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text
                       bg-gradient-to-r from-[#041B2D] via-[#063A67] to-[#06C1A0] drop-shadow-sm">
            Welcome to LVE360
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
            Your personalized health optimization platform — assessed with AI,
            organized in plain English, and ready to act on.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/pricing"
              className="group inline-flex items-center gap-2 rounded-2xl
                bg-[#06C1A0] text-white px-7 py-3 font-semibold
                shadow-[0_10px_25px_rgba(6,193,160,0.35)]
                transition-all hover:shadow-[0_14px_34px_rgba(6,193,160,0.45)]
                focus-visible:ring-4 focus-visible:ring-[#06C1A0]/30 relative overflow-hidden"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-white/20
                               [mask-image:linear-gradient(90deg,transparent,white,transparent)]
                               group-hover:translate-x-full transition-transform duration-700" />
              <span className="text-lg">💎</span>
              <span>See Premium Plans</span>
            </Link>

            <Link
              href="/results"
              className="inline-flex items-center gap-2 rounded-2xl border border-[#06C1A0]/30 bg-white
                text-[#041B2D] px-7 py-3 font-semibold
                hover:border-[#06C1A0] hover:bg-[#F7FFFC] transition-colors
                focus-visible:ring-4 focus-visible:ring-[#06C1A0]/20"
            >
              <span className="text-lg">📊</span>
              <span>View Your Report</span>
            </Link>
          </div>

          <p className="mt-6 text-sm text-gray-600">
            Already a member?{" "}
            <Link href="/login" className="text-[#06C1A0] font-medium hover:underline">
              Log in →
            </Link>
          </p>
        </FadeInWhenVisible>

        {/* Credibility cards */}
        <FadeInWhenVisible>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            {[
              { icon: "📜", text: "DSHEA-aligned supplement framework" },
              { icon: "⚡", text: "Actionable, not overwhelming" },
              { icon: "🧠", text: "AI-powered, evidence-based insights" },
            ].map((item) => (
              <div
                key={item.text}
                className="rounded-xl bg-white/70 ring-1 ring-gray-200 px-4 py-3 backdrop-blur text-gray-700
                           hover:bg-white/90 transition-colors"
              >
                <span className="mr-2">{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>
        </FadeInWhenVisible>
      </section>

      {/* ---------------- 1. How It Works ---------------- */}
      <FadeInWhenVisible>
        <section className="max-w-6xl mx-auto px-6 py-16 text-center">
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
                <div className="text-2xl font-bold text-[#06C1A0] mb-2">Step {s.step}</div>
                <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </FadeInWhenVisible>

      {/* ---------------- 2. Social Proof ---------------- */}
      <FadeInWhenVisible>
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
      </FadeInWhenVisible>

      {/* ---------------- 5. Security Badges ---------------- */}
      <FadeInWhenVisible>
        <section className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-3xl font-bold text-[#041B2D] mb-6">Trusted & Secure</h2>
          <div className="flex justify-center gap-10 opacity-70">
            <div className="h-12 w-28 rounded bg-gray-100 ring-1 ring-gray-200 flex items-center justify-center">Stripe</div>
            <div className="h-12 w-28 rounded bg-gray-100 ring-1 ring-gray-200 flex items-center justify-center">Supabase</div>
            <div className="h-12 w-28 rounded bg-gray-100 ring-1 ring-gray-200 flex items-center justify-center">DSHEA</div>
          </div>
        </section>
      </FadeInWhenVisible>
    </main>
  );
}
