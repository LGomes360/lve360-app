export default function QuizPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#EAFBF8] via-white to-[#F8F5FB] flex items-center justify-center px-6 py-24">
      {/* Centered quiz container */}
      <div className="w-full max-w-5xl bg-white/90 backdrop-blur-md rounded-2xl shadow-lg ring-1 ring-gray-200 p-4 sm:p-8">
<iframe
  src="https://tally.so/r/mOqRBk?alignLeft=1&hideTitle=1&transparentBackground=1"
  title="LVE360 Quiz"
  width="100%"
  height="100%"
  frameBorder="0"
  marginHeight={0}
  marginWidth={0}
  className="rounded-xl min-h-[1500px] sm:min-h-[1800px] lg:min-h-[2000px]"
  style={{
    backgroundColor: "white",
  }}
></iframe>

      </div>

      {/* Ambient blobs (for continuity with homepage) */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full
                   bg-[#A8F0E4] opacity-25 blur-3xl animate-[float_8s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 -right-24 h-[28rem] w-[28rem] rounded-full
                   bg-[#D9C2F0] opacity-25 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />
    </main>
  );
}
