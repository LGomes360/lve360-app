"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function DashboardHeader() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="bg-white/90 backdrop-blur-md shadow-sm border-b border-purple-100 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
        {/* Logo / Brand */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <img
            src="/icons/lve360-logo.png"
            alt="LVE360"
            className="h-8 w-auto"
          />
          <span className="font-bold text-lg bg-gradient-to-r from-[#041B2D] via-[#06C1A0] to-purple-600 bg-clip-text text-transparent">
            LVE360
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-[#041B2D]">
          <Link
            href="/dashboard"
            className="hover:text-purple-600 transition"
          >
            Dashboard
          </Link>
          <Link href="/quiz" className="hover:text-purple-600 transition">
            My Quiz
          </Link>
          <Link href="/export" className="hover:text-purple-600 transition">
            Exports
          </Link>
          <Link href="/account" className="hover:text-purple-600 transition">
            Account
          </Link>

          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] text-white rounded-lg hover:opacity-90 transition shadow-md"
          >
            Sign Out
          </button>
        </nav>
      </div>
    </header>
  );
}
