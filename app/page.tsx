import Link from "next/link";

export default function Home() {
  return (
    <main className="relative isolate overflow-hidden">
      {/* Animated background blobs */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full
                   bg-purple-400 opacity-40 blur-3xl animate-[float_8s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-24 -right-24 h-[28rem] w-[28rem] rounded-full
                   bg-yellow-300 opacity-30 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />

{/* ---------------- Hero Section ---------------- */}
<section className="max-w-6xl mx-auto px-6 pt-20 sm:pt-28 pb-16 text-center relative">
  {/* Background gradient */}
  <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#6B3FA0]/15 via-[#06C1A0]/10 to-[#FDE68A]/20" />

  {/* Tagline pill */}
  <div className="inline-flex items-center gap-2 rounded-full bg-white/70 ring-1 ring-gray-200 px-4 py-1.5 mb-6 backdrop-blur">
    <span className="h-2 w-2 rounded-full bg-[#06C1A0]" />
    <span className="text-sm text-gray-700">
      Concierge insights for Longevity • Vitality • Energy
    </span>
  </div>

  {/* Gradient Title */}
  <h1
    className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text
               bg-gradient-to-r from-[#6B3FA0] via-[#06C1A0] to-[#FDE68A] drop-shadow-md"
  >
    Welcome to LVE360
  </h1>

  <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
    Your personalized health optimization platform — assessed with AI,
    organized in plain English, and ready to act on.
  </p>

  {/* Single CTA */}
  <div className="mt-10 flex justify-center">
    <Link
      href="https://tally.so/r/mOqRBk"
      target="_blank"
      className="group inline-flex items-center gap-2 rounded-2xl
        bg-[#6B3FA0] text-white px-7 py-3 font-semibold
        shadow-[0_10px_25px_rgba(107,63,160,0.35)]
        transition-all hover:shadow-[0_14px_34px_rgba(107,63,160,0.45)]
        focus-visible:ring-4 focus-visible:ring-[#6B3FA0]/30 relative overflow-hidden"
    >
      {/* Shine */}
      <span
        className="pointer-events-none absolute inset-0 -translate-x-full bg-white/20
                   [mask-image:linear-gradient(90deg,transparent,white,transparent)]
                   group-hover:translate-x-full transition-transform duration-700"
      />
      <span className="text-lg">🚀</span>
      <span>Start Free Quiz</span>
    </Link>
  </div>

  <p className="mt-6 text-sm text-gray-600">
    Already a member?{" "}
    <Link href="/login" className="text-[#06C1A0] font-medium hover:underline">
      Log in →
    </Link>
  </p>
</section>


      {/* ---------------- Credibility Cards ---------------- */}
      <section className="max-w-6xl mx-auto px-6 py-12 text-center">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            { icon: "⚡", text: "Actionable, not overwhelming" },
            { icon: "📖", text: "Aligned with DSHEA supplement guidelines" },
            { icon: "🧬", text: "AI-driven personalization" },
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

      {/* ---------------- Free vs Premium ---------------- */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-[#041B2D] mb-8">Free vs Premium</h2>
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="rounded-xl border-2 border-yellow-400 bg-white p-6 shadow-sm">
              <h3 className="font-semibold mb-3 text-yellow-600">Free</h3>
              <ul className="text-left text-gray-600 space-y-2">
                <li>✓ Personalized Report</li>
                <li>✓ Contraindications</li>
                <li>✓ Bang-for-Buck Picks</li>
                <li>✗ Weekly Tweaks</li>
                <li>✗ Dashboard</li>
              </ul>
            </div>
            <div className="rounded-xl border-2 border-purple-500 bg-white p-6 shadow-lg">
              <h3 className="font-semibold mb-3 text-purple-700">Premium</h3>
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
          ].map((d, idx) => (
            <div
              key={idx}
              className="rounded-xl bg-gradient-to-r from-purple-50 to-yellow-50 p-6 shadow border border-gray-200"
            >
              <div className="text-3xl mb-2">{d.icon}</div>
              <p className="font-medium text-gray-700">{d.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Bottom CTA ---------------- */}
      <section className="bg-yellow-400 text-gray-900 py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Start?</h2>
        <p className="mb-6">Take the quiz now and get your free personalized report in minutes.</p>
        <Link
          href="/quiz"
          className="bg-white text-yellow-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50"
        >
          Start Free Quiz →
        </Link>
      </section>
    </main>
  );
}
