// app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand to-brand-dark text-white text-center px-6">
      {/* Hero Section */}
      <h1 className="text-5xl sm:text-6xl font-extrabold mb-6 drop-shadow-lg">
        Welcome to <span className="text-brand-light">LVE360</span>
      </h1>

      <p className="text-xl sm:text-2xl mb-10 max-w-2xl text-gray-100">
        Your personalized health optimization platform for{" "}
        <span className="text-brand-light font-semibold">Longevity</span>,{" "}
        <span className="text-brand-light font-semibold">Vitality</span>, and{" "}
        <span className="text-brand-light font-semibold">Energy</span>.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/pricing"
          className="px-8 py-4 bg-white text-brand-dark font-semibold text-lg rounded-full shadow-lg hover:shadow-2xl hover:scale-105 transition transform"
        >
          💎 See Premium Plans
        </Link>
        <Link
          href="/results"
          className="px-8 py-4 bg-brand-light text-brand-dark font-semibold text-lg rounded-full shadow-lg hover:shadow-2xl hover:scale-105 transition transform"
        >
          📊 View Your Report
        </Link>
      </div>
    </main>
  );
}
