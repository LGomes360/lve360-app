//app/quiz/page.tsx


"use client";

import { motion } from "framer-motion";
import IntakeEmbed from "@/components/intake/IntakeEmbed";

export default function QuizPage() {
  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-start
                 bg-gradient-to-b from-[#EAFBF8] via-white to-[#F8F5FB]
                 py-24 px-4 sm:px-6 overflow-hidden"
    >
      {/* Floating & Pulsing background blobs */}
      <motion.div
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full
                   bg-[#A8F0E4] opacity-25 blur-3xl"
        aria-hidden
        animate={{ scale: [1, 1.1, 1] }}
        transition={{
          duration: 10,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />
      <motion.div
        className="pointer-events-none absolute top-40 -right-32 h-[28rem] w-[28rem] rounded-full
                   bg-[#D9C2F0] opacity-25 blur-3xl"
        aria-hidden
        animate={{ scale: [1, 1.15, 1] }}
        transition={{
          duration: 12,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />

      {/* Animated container for quiz */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 w-full max-w-5xl rounded-3xl overflow-hidden
                   shadow-xl ring-1 ring-gray-200 bg-white/95 backdrop-blur"
      >
      {/* Shared intake embed */}
      <div className="relative w-full overflow-hidden rounded-3xl">
        <IntakeEmbed className="min-h-[640px] w-full bg-white" />
      </div>
      </motion.div>
    </main>
  );
}
