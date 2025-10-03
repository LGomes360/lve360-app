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
<main className="relative isolate overflow-hidden bg-gradient-to-b from-[#EAFBF8] via-white to-[#F8F5FB]">
  {/* Animated background blobs */}
  <div
    className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full
               bg-[#A8F0E4] opacity-30 blur-3xl animate-[float_8s_ease-in-out_infinite]"
    aria-hidden
  />
  <div
    className="pointer-events-none absolute top-24 -right-24 h-[28rem] w-[28rem] rounded-full
               bg-[#D9C2F0] opacity-20 blur-3xl animate-[float_10s_ease-in-out_infinite]"
    aria-hidden
  />

  <section className="max-w-6xl mx-auto px-6 pt-20 sm:pt-28 pb-16 text-center">
    <div className="inline-flex items-center gap-2 rounded-full bg-white/70 ring-1 ring-gray-200 px-4 py-1.5 mb-6 backdrop-blur">
      <span className="h-2 w-2 rounded-full bg-[#06C1A0]" />
      <span className="text-sm text-gray-700">
        Concierge insights for Longevity • Vitality • Energy
      </span>
    </div>

    <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text
                   bg-gradient-to-r from-[#041B2D] to-[#06C1A0] drop-shadow-sm">
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
  </section>
</main>

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
    <div className="rounded-xl bg-white p-6 shadow hover:shadow-md transition">
      <div className="text-3xl mb-2 text-purple-600">📖</div>
      <p className="text-gray-700">Evidence-based</p>
    </div>
    <div className="rounded-xl bg-white p-6 shadow hover:shadow-md transition">
      <div className="text-3xl mb-2 text-[#06C1A0]">🧬</div>
      <p className="text-gray-700">Personalized to you</p>
    </div>
    <div className="rounded-xl bg-white p-6 shadow hover:shadow-md transition">
      <div className="text-3xl mb-2 text-yellow-500">🤝</div>
      <p className="text-gray-700">Concierge-ready</p>
    </div>
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
