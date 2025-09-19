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
                   bg-[#06C1A0] opacity-20 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />

      <section className="max-w-6xl mx-auto px-6 pt-20 sm:pt-28 pb-16 text-center">
        {/* Tagline pill */}
        <div className="inline-flex items-center gap-2 rounded-full bg-white/70 ring-1 ring-gray-200 px-4 py-1.5 mb-6 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#06C1A0]" />
          <span className="text-sm text-gray-700">
            Concierge insights for Longevity • Vitality • Energy
          </span>
        </div>

        {/* Gradient title */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text
                       bg-gradient-to-r from-[#041B2D] via-[#063A67] to-[#06C1A0] drop-shadow-sm">
          Welcome to LVE360
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
          Your personalized health optimization platform — assessed with AI,
          organized in plain English, and ready to act on.
        </p>

        {/* CTAs with micro-interactions */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/pricing"
            className="
              group inline-flex items-center gap-2 rounded-2xl
              bg-[#06C1A0] text-white px-7 py-3 font-semibold
              shadow-[0_10px_25px_rgba(6,193,160,0.35)]
              transition-all hover:shadow-[0_14px_34px_rgba(6,193,160,0.45)]
              focus-visible:ring-4 focus-visible:ring-[#06C1A0]/30
              relative overflow-hidden
            "
          >
            {/* Shine */}
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-white/20
                             [mask-image:linear-gradient(90deg,transparent,white,transparent)]
                             group-hover:translate-x-full transition-transform duration-700" />
            <span className="text-lg">💎</span>
            <span>See Premium Plans</span>
          </Link>

          <Link
            href="/results"
            className="
              inline-flex items-center gap-2 rounded-2xl border border-[#06C1A0]/30 bg-white
              text-[#041B2D] px-7 py-3 font-semibold
              hover:border-[#06C1A0] hover:bg-[#F7FFFC] transition-colors
              focus-visible:ring-4 focus-visible:ring-[#06C1A0]/20
            "
          >
            <span className="text-lg">📊</span>
            <span>View Your Report</span>
          </Link>
        </div>

        {/* Credibility cards */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            { icon: "🔒", text: "HIPAA-friendly architecture" },
            { icon: "⚡", text: "Actionable, not overwhelming" },
            { icon: "🧠", text: "AI + clinician informed" },
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

      {/* “As seen in” placeholders to swap later */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 items-center opacity-70">
          <div className="h-10 rounded bg-gray-100 ring-1 ring-gray-200" />
          <div className="h-10 rounded bg-gray-100 ring-1 ring-gray-200" />
          <div className="h-10 rounded bg-gray-100 ring-1 ring-gray-200" />
          <div className="h-10 rounded bg-gray-100 ring-1 ring-gray-200" />
        </div>
      </section>
    </main>
  );
}
