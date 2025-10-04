export default function QuizPage() {
  return (
    <main className="relative min-h-screen bg-gradient-to-b from-[#EAFBF8] via-white to-[#F8F5FB]">
      {/* Outer wrapper adds margin from header */}
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-24">
        {/* Soft white container with subtle shadow + rounded edges */}
        <div className="rounded-2xl shadow-lg ring-1 ring-gray-200 bg-white/90 backdrop-blur-sm p-4 sm:p-8">
          <iframe
            src="https://tally.so/r/mOqRBk?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1"
            width="100%"
            height="950"
            frameBorder="0"
            title="LVE360 Quiz"
            className="w-full rounded-xl bg-transparent"
            style={{
              padding: "12px",
              borderRadius: "12px",
              backgroundColor: "white",
            }}
          ></iframe>
        </div>
      </div>

      {/* Optional soft floating gradients (mirroring homepage) */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full
                   bg-[#A8F0E4] opacity-30 blur-3xl animate-[float_8s_ease-in-out_infinite]"
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
