"use client";

import { useEffect } from "react";

export default function QuizPage() {
  useEffect(() => {
    // Listen for resize messages from Tally
    function handleTallyMessage(event: MessageEvent) {
      if (event.origin.includes("tally.so") && event.data?.height) {
        const iframe = document.querySelector<HTMLIFrameElement>("#tally-embed");
        if (iframe) iframe.style.height = `${event.data.height}px`;
      }
    }
    window.addEventListener("message", handleTallyMessage);
    return () => window.removeEventListener("message", handleTallyMessage);
  }, []);

  return (
    <main className="max-w-5xl mx-auto p-6 pt-28 pb-12">
      <div className="rounded-2xl overflow-hidden shadow-lg ring-1 ring-gray-200 bg-white">
        <iframe
          id="tally-embed"
          src="https://tally.so/embed/mOqRBk?alignLeft=1&hideTitle=1&transparentBackground=1"
          title="LVE360 Quiz"
          width="100%"
          height="1000"
          frameBorder="0"
          marginHeight={0}
          marginWidth={0}
          className="w-full min-h-[800px] sm:min-h-[1000px] bg-white"
        />
      </div>
    </main>
  );
}
