export default function Home() {
  return (
    <main className="max-w-3xl mx-auto py-20 px-6 text-center">
      {/* Gradient headline */}
      <h1 className="text-5xl font-extrabold bg-gradient-to-r from-teal-500 to-[#041B2D] bg-clip-text text-transparent mb-6">
        Welcome to LVE360
      </h1>

      {/* Subtitle */}
      <p className="text-lg text-gray-700 mb-10">
        Your personalized health optimization platform for{" "}
        <span className="font-semibold text-[#06C1A0]">
          Longevity • Vitality • Energy
        </span>
      </p>

      {/* Call-to-action buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <a
          href="/pricing"
          className="px-6 py-3 rounded-xl bg-[#06C1A0] text-white font-semibold shadow-lg hover:bg-[#049e85] transition"
        >
          See Premium Plans
        </a>
        <a
          href="/results"
          className="px-6 py-3 rounded-xl border border-[#06C1A0] text-[#06C1A0] font-semibold hover:bg-[#E6FCF8] transition"
        >
          View Your Report
        </a>
      </div>
    </main>
  );
}
