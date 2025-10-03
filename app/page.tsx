import Link from "next/link";

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
                   bg-[#6B21A8] opacity-20 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />

      {/* ---------------- Hero Section ---------------- */}
      <section className="max-w-6xl mx-auto px-6 pt-20 sm:pt-28 pb-16 text-center">
        {/* Tagline pill */}
        <div className="inline-flex items-center gap-2 rounded-full bg-white/70 ring-1 ring-gray-200 px-4 py-1.5 mb-6 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#06C1A0]" />
          <span className="text-sm text-gray-700">
            Concierge insights for Longevity • Vitality • Energy
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text
                       bg-gradient-to-r from-[#041B2D] via-[#6B21A8] to-[#06C1A0] drop-shadow-sm">
          Welcome to LVE360
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
          Your personalized health optimization platform — assessed with AI,
          organized in plain English, and ready to act on.
        </p>

        {/* Primary CTA */}
        <div className="mt-10 flex justify-center">
          <Link
            href="/quiz"
            className="inline-flex items-center gap-2 rounded-2xl
              bg-purple-600 text-white px-8 py-3 font-semibold
              shadow-[0_10px_25px_rgba(107,33,168,0.35)]
              transition-all hover:shadow-[0_14px_34px_rgba(107,33,168,0.45)]
              focus-visible:ring-4 focus-visible:ring-purple-400/50"
          >
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

        {/* Credibility cards */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            { icon: "⚖", text: "DSHEA-compliant (supplements)" },
            { icon: "⚡", text: "Actionable, not overwhelming" },
            { icon: "🧠", text: "AI-driven, guided by wellness experts" },
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
      </section>

      {/* ---------------- How It Works ---------------- */}
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
            <div key={s.step} className="rounded-2xl bg-white shadow p-6 border-t-4 border-[#FDE68A]">
              <div className="text-2xl font-bold text-[#06C1A0] mb-2">Step {s.step}</div>
              <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
              <p className="text-gray-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Dashboard Preview ---------------- */}
      <section className="bg-gray-50 py-16 text-center">
        <h2 className="text-3xl font-bold text-[#041B2D] mb-6">See Your Dashboard</h2>
        <div className="flex flex-col sm:flex-row justify-center gap-8">
          <div className="h-64 w-40 bg-gradient-to-br from-[#06C1A0] to-[#A8F0E4] rounded-lg shadow-lg flex items-center justify-center text-white font-bold">
            Mobile View
          </div>
          <div className="h-64 w-96 bg-gradient-to-br from-[#6B21A8] to-[#06C1A0] rounded-lg shadow-lg flex items-center justify-center text-white font-bold">
            Desktop View
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-600">* Previews — actual dashboard is interactive</p>
      </section>

      {/* ---------------- Sticky CTA ---------------- */}
      <section className="bg-[#06C1A0] text-white py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Start?</h2>
        <p className="mb-6">Take the quiz now and get your free personalized report in minutes.</p>
        <Link
          href="/quiz"
          className="bg-white text-[#06C1A0] px-6 py-3 rounded-lg font-semibold hover:bg-gray-50"
        >
          Start Free Quiz →
        </Link>
      </section>
    </main>
  );
}
