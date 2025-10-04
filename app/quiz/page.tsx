export default function QuizPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 pt-28 pb-24">
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
    </main>
  );
}

