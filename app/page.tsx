// -----------------------------------------------------------------------------
// File: app/page.tsx
// LVE360 // Homepage
// Welcomes users with branding, tagline, and primary actions.
// -----------------------------------------------------------------------------

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto py-16 px-6 text-center">
      {/* Gradient Heading */}
      <h1 className="text-5xl font-extrabold mb-6 bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-transparent">
        Welcome to LVE360
      </h1>

      {/* Tagline */}
      <p className="text-lg text-gray-700 mb-10">
        Your personalized health optimization platform for
        <span className="font-semibold text-brand"> Longevity</span>,{" "}
        <span className="font-semibold text-brand">Vitality</span>, and{" "}
        <span className="font-semibold text-brand">Energy</span>.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <a
          href="/pricing"
          className="px-6 py-3 rounded-xl bg-brand text-white font-semibold shadow hover:bg-brand-dark transition"
        >
          💎 See Premium Plans
        </a>
        <a
          href="/results"
          className="px-6 py-3 rounded-xl border border-brand text-brand font-semibold hover:bg-brand-light hover:text-brand-dark transition"
        >
          📊 View Your Report
        </a>
      </div>
    </main>
  );
}
