"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] text-gray-900">
        {/* Header (LVE360 App Shell) */}
        <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-lg shadow-sm border-b border-purple-100">
          <nav className="max-w-6xl mx-auto flex items-center justify-between py-4 px-6">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2">
              <img src="/logo.svg" alt="LVE360" className="w-8 h-8" />
              <span className="font-extrabold text-lg text-[#7C3AED]">
                LVE360
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              <Link href="/dashboard" className="hover:text-purple-600">
                Dashboard
              </Link>
              <Link href="/my-quiz" className="hover:text-purple-600">
                My Quiz
              </Link>
              <Link href="/exports" className="hover:text-purple-600">
                Exports
              </Link>
              <Link href="/account" className="hover:text-purple-600">
                Account
              </Link>
              <button
                onClick={async () => {
                  await fetch("/api/auth/signout", { method: "POST" });
                  window.location.href = "/";
                }}
                className="bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] text-white px-4 py-1.5 rounded-lg shadow hover:opacity-90 transition"
              >
                Sign Out
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden text-gray-700"
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </nav>

          {/* Mobile dropdown */}
          {open && (
            <div className="md:hidden bg-white/90 backdrop-blur-md border-t border-purple-100 shadow-md">
              <div className="flex flex-col p-4 space-y-2 text-sm font-medium">
                <Link href="/dashboard" onClick={() => setOpen(false)}>
                  Dashboard
                </Link>
                <Link href="/my-quiz" onClick={() => setOpen(false)}>
                  My Quiz
                </Link>
                <Link href="/exports" onClick={() => setOpen(false)}>
                  Exports
                </Link>
                <Link href="/account" onClick={() => setOpen(false)}>
                  Account
                </Link>
                <button
                  onClick={async () => {
                    await fetch("/api/auth/signout", { method: "POST" });
                    window.location.href = "/";
                  }}
                  className="bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] text-white px-3 py-2 rounded-lg shadow hover:opacity-90 transition text-left"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </header>

        {/* Main body */}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
