import Link from "next/link";

export default function Home() {
  return (
    <main
      className="
        relative isolate overflow-hidden
        bg-gradient-to-b from-[#EAF9F4] via-white to-white
      "
    >
      {/* subtle blur blob */}
      <div
        className="pointer-events-none absolute -top-32 right-[-10%] h-72 w-72 rounded-full
                   bg-[#A8F0E4] blur-3xl opacity-40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-40 left-[-10%] h-80 w-80 rounded-full
                   bg-[#06C1A0] blur-3xl opacity-20"
        aria-hidden
      />

      <section className="max-w-5xl mx-auto px-6 py-20 sm:py-28 text-center">
        {/* Tagline */}
        <div className="inline-flex items-center gap-2 rounded-full bg-white/70 ring-1 ring-gray-200 px-4 py-1.5 mb-6 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#06C1A0]" />
          <span className="text-sm text-gray-700">
            Concierge insights for Longevity • Vitality • Energy
          </span>
        </div>

        {/* Title */}
        <h1
          className="
            text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight
            text-transparent bg-clip-text
            bg-gradient-to-r from-[#041B2D] via-[#063A67] to-[#06C1A0]
            drop-shadow-sm
          "
        >
          Welcome to LVE360
        </h1>

        {/* Subcopy */}
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
          Your personalized health optimization platform — assessed with AI,
          organized in plain English, and ready to act on.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/pricing"
            className="
              group inline-flex items-center justify-center gap-2
              rounded-xl bg-[#06C1A0] px-6 py-3 font-semibold text-white
              shadow-[0_8px_20px_rgba(6,193,160,0.35)]
              transition-transform
              hover:shadow-[0_10px_28px_rgba(6,193,160,0.45)]
              active:scale-[0.98]
            "
          >
            <span className="text-lg">💎</span>
            <span>See Premium Plans</span>
          </Link>

          <Link
            href="/results"
            className="
              inline-flex items-center justify-center gap-2
              rounded-xl border border-[#06C1A0]/30 bg-white px-6 py-3
              text-[#041B2D] font-semibold
              hover:border-[#06C1A0] hover:bg-[#F7FFFC]
              transition-colors
            "
          >
            <span className="text-lg">📊</span>
            <span>View Your Report</span>
          </Link>
        </div>

        {/* Trust row */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-500">
          <div className="rounded-xl bg-white/60 ring-1 ring-gray-200 px-4 py-3 backdrop-blur">
            🔒 HIPAA-friendly architecture
          </div>
          <div className="rounded-xl bg-white/60 ring-1 ring-gray-200 px-4 py-3 backdrop-blur">
            ⚡ Actionable, not overwhelming
          </div>
          <div className="rounded-xl bg-white/60 ring-1 ring-gray-200 px-4 py-3 backdrop-blur">
            🧠 AI + clinician informed
          </div>
        </div>
      </section>
    </main>
  );
}
