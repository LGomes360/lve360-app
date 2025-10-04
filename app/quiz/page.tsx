"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";

export default function QuizPage() {
  useEffect(() => {
    // Allow Tally to auto-resize the iframe dynamically
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
    <main
      className="relative min-h-screen flex flex-col items-center justify-start
                 bg-gradient-to-b from-[#EAFBF8] via-white to-[#F8F5FB]
                 py-24 px-4 sm:px-6 overflow-hidden"
    >
      {/* Floating background accents */}
      <div
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full
                   bg-[#A8F0E4] opacity-25 blur-3xl animate-[float_8s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-40 -right-32 h-[28rem] w-[28rem] rounded-full
                   bg-[#D9C2F0] opacity-25 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />

      {/* Animated container for the quiz */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 w-full max-w-5xl rounded-3xl overflow-hidden
                   shadow-xl ring-1 ring-gray-200 bg-white/95 backdrop-blur"
      >
        <iframe
          id="tally-embed"
          src="https://tally.so/embed/mOqRBk?alignLeft=1&hideTitle=1&transparentBackground=1"
          title="LVE360 Quiz"
          width="100%"
          height="1000"
          frameBorder="0"
          marginHeight={0}
          marginWidth={0}
          className="w-full min-h-[800px] sm:min-h-[1000px]"
        />
      </motion.div>
    </main>
  );
}
