export default function Home() {
  return (
    <main className="max-w-3xl mx-auto py-12 px-6 text-center">
      <h1 className="text-4xl font-bold mb-4 text-[var(--lve-navy)]">
        Welcome to LVE360
      </h1>
      <p className="text-lg text-gray-700">
        Your personalized health optimization platform.<br/>
        <a href="/pricing" style={{color: '#06C1A0'}}>See Premium Plans</a> or <a href="/results" style={{color: '#06C1A0'}}>View Your Report</a>
      </p>
    </main>
  );
}
