"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function DashboardHeader() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
<header
  className="
    sticky top-0 z-50
    bg-white/40 backdrop-blur-xl
    border-b border-white/30
    shadow-[0_2px_12px_rgba(0,0,0,0.05)]
  "
>
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
        {/* Logo only — no brand text */}
        <Link href="/dashboard" className="flex items-center" aria-label="LVE360 Dashboard">
          <img
            src="/icons/lve360-logo.png"  /* keep .png (matches what you deployed) */
            alt="LVE360"
            className="h-8 w-auto select-none"
            draggable={false}
          />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#041B2D]">
          <Link href="/dashboard" className="hover:text-[#06C1A0] transition-colors">Dashboard</Link>
          <Link href="/quiz" className="hover:text-[#06C1A0] transition-colors">My Quiz</Link>
          <Link href="/export" className="hover:text-[#06C1A0] transition-colors">Exports</Link>
          <Link href="/account" className="hover:text-[#06C1A0] transition-colors">Account</Link>
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-lg text-white shadow-md
                       bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] hover:opacity-90 transition"
          >
            Sign Out
          </button>
        </nav>

        {/* Mobile Toggle */}
        <button
          className="md:hidden text-[#041B2D] hover:text-[#7C3AED] transition"
          onClick={() => setMenuOpen((s) => !s)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Animated Mobile Drawer */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="md:hidden bg-white/95 backdrop-blur-md border-t border-purple-100 shadow-lg"
          >
            <nav className="flex flex-col text-sm font-medium text-[#041B2D] p-4 space-y-3">
              <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="hover:text-[#06C1A0] transition">Dashboard</Link>
              <Link href="/quiz" onClick={() => setMenuOpen(false)} className="hover:text-[#06C1A0] transition">My Quiz</Link>
              <Link href="/export" onClick={() => setMenuOpen(false)} className="hover:text-[#06C1A0] transition">Exports</Link>
              <Link href="/account" onClick={() => setMenuOpen(false)} className="hover:text-[#06C1A0] transition">Account</Link>
              <button
                onClick={() => { setMenuOpen(false); handleSignOut(); }}
                className="px-3 py-2 rounded-lg text-white shadow-md
                           bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] hover:opacity-90 transition"
              >
                Sign Out
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
