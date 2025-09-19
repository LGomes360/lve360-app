export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center text-center min-h-screen bg-gradient-to-b from-brand-dark via-brand to-brand-light text-white px-4">
      {/* Hero Section */}
      <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight drop-shadow-lg">
        Welcome to <span className="text-brand-light">LVE360</span>
      </h1>
      <p className="mt-6 text-lg sm:text-xl max-w-2xl text-gray-100">
        Your personalized health optimization platform for{" "}
        <span className="font-semibold">Longevity</span>,{" "}
        <span className="font-semibold">Vitality</span>, and{" "}
        <span className="font-semibold">Energy</span>.
      </p>

      {/* Call-to-Action Buttons */}
      <div className="mt-10 flex flex-col sm:flex-row gap-4">
        <a
          href="/pricing"
          className="px-6 py-3 rounded-xl bg-white text-brand-dark font-semibold shadow-lg hover:bg-brand-light hover:text-white transition"
        >
          💎 See Premium Plans
        </a>
        <a
          href="/results"
          className="px-6 py-3 rounded-xl border border-white text-white font-semibold shadow-lg hover:bg-white hover:text-brand-dark transition"
        >
          📊 View Your Report
        </a>
      </div>
    </main>
  );
}
