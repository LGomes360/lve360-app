export default function QuizPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 pt-32 pb-24">
      <div className="flex justify-center">
        <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-lg ring-1 ring-gray-200 bg-white/90 backdrop-blur-sm">
          <iframe
            src="https://tally.so/r/mOqRBk?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1"
            width="100%"
            height="900"
            frameBorder="0"
            title="LVE360 Quiz"
            className="w-full h-[90vh] rounded-2xl bg-transparent"
          ></iframe>
        </div>
      </div>
    </main>
  );
}

