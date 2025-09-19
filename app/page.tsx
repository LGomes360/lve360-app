export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 px-6">
      <div className="max-w-3xl w-full text-center bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg p-12">
        {/* Gradient headline */}
        <h1 className="text-5xl font-extrabold bg-gradient-to-r from-[#06C1A0] to-[#041B2D] bg-clip-text text-transparent mb-6">
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
            className="inline-flex items-center justify-center px-8 py-3 rounded-full bg-[#06C1A0] text-white font-semibold shadow-md hover:scale-105 hover:bg-[#049e85] transition-transform duration-200"
          >
            💎 See Premium Plans
          </a>
          <a
            href="/results"
            className="inline-flex items-center justify-center px-8 py-3 rounded-full border-2 border-[#06C1A0] text-[#06C1A0] font-semibold hover:bg-[#E6FCF8] hover:scale-105 transition-transform duration-200"
          >
            📊 View Your Report
          </a>
        </div>
      </div>
    </main>
  );
}
