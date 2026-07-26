"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

import IntakeEmbed, { IntakePrivacyNotice } from "@/components/intake/IntakeEmbed";

export default function IntakeModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const onPointerDown = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) onClose();
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="LVE360 intake"
    >
      <motion.div
        ref={modalRef}
        className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-3 z-10 rounded-full bg-white/90 px-3 py-1 text-xl text-slate-500 shadow-sm hover:bg-slate-100 hover:text-slate-900"
          aria-label="Close intake"
        >
          ×
        </button>
        <IntakePrivacyNotice />
        <div className="flex-1 overflow-auto">
          <IntakeEmbed showPrivacyNotice={false} />
        </div>
      </motion.div>
    </motion.div>
  );
}
