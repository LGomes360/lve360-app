export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E6FCF8] via-white to-[#F9FAFB] px-6">
      <div className="max-w-4xl w-full text-center">
        {/* Hero Section */}
        <div className="bg-white/80 backdrop-blur-md rounded-3xl shadow-2xl p-12 border border-gray-200">
          <h1 className="text-6xl font-extrabold mb-6 bg-gradient-to-r from-[#06C1A0] to-[#041B2D] bg-clip-text text-transparent drop-shadow-sm">
            Welcome to LVE360
          </h1>
          <p className="text-xl text-gray-700 mb-10 leading-relaxed">
            Your personalized health optimization platform for <br />
            <span className="text-[#06C1A0] font-semibold">
              Longevity • Vitality • Energy
            </span>
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <a
              href="/pricing"
              className="inline-flex items-center justify-center px-10 py-4 rounded-full bg-[#06C1A0] text-white text-lg font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-200"
            >
              💎 See Premium Plans
            </a>
            <a
              href="/results"
              className="inline-flex items-center justify-center px-10 py-4 rounded-full border-2 border-[#06C1A0] text-[#06C1A0] text-lg font-semibold hover:bg-[#E6FCF8] hover:scale-105 transition-transform duration-200"
            >
              📊 View Your Report
            </a>
          </div>
        </div>

        {/* Tagline */}
        <p className="mt-12 text-gray-600 text-sm tracking-wide uppercase">
          💡 AI-Powered Wellness, Backed by Science
        </p>
      </div>
    </main>
  );
}
