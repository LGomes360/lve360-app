export default function Home() {
  return (
    <main className="max-w-3xl mx-auto py-16 px-6 text-center">
      {/* Big, bold gradient heading */}
      <h1 className="text-5xl font-extrabold mb-6 bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-transparent">
        Welcome to LVE360
      </h1>

      {/* Subheading */}
      <p className="text-xl text-gray-700 mb-8">
        Your personalized health optimization platform.
      </p>

      {/* Links with Tailwind styling */}
      <p className="space-x-4">
        <a href="/pricing" className="text-brand hover:text-brand-dark font-semibold">
          See Premium Plans
        </a>
        <span className="text-gray-500">or</span>
        <a href="/results" className="text-brand hover:text-brand-dark font-semibold">
          View Your Report
        </a>
      </p>
    </main>
  );
}
