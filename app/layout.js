import "./globals.css";
import Link from "next/link";
import { SpeedInsights } from "@vercel/speed-insights/next"; // ✅ Added import
import { Analytics } from "@vercel/analytics/react";

export const metadata = {
  title: "LVE360",
  description: "Longevity | Vitality | Energy",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-gray-900">
        {/* Minimal header - transparent, floating */}
        <header className="absolute top-0 left-0 w-full z-40">
          <nav className="max-w-6xl mx-auto flex items-center justify-between py-5 px-6">
            {/* Logo */}
            <Link
              href="/"
              className="font-extrabold text-xl tracking-tight text-purple-600"
            >
              LVE360
            </Link>

            {/* Nav Links */}
            <div className="space-x-6 text-sm sm:text-base flex items-center">
              <Link
                href="/"
                className="hover:text-purple-600 transition-colors"
              >
                Home
              </Link>
              <Link
                href="/pricing"
                className="hover:text-purple-600 transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="/login"
                className="bg-purple-600 px-3 py-1.5 rounded-lg font-medium text-white hover:bg-purple-700 transition-colors shadow-sm"
              >
                Log in
              </Link>
            </div>
          </nav>
        </header>

        {/* Main body */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="bg-gray-50 text-gray-600 border-t border-gray-200">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 py-6 px-4 text-sm">
            <p>
              © {new Date().getFullYear()}{" "}
              <span className="font-semibold text-purple-600">LVE360</span>. All
              rights reserved.
            </p>
            <div className="space-x-4">
              <Link href="/terms" className="hover:text-purple-600 transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-purple-600 transition-colors">
                Privacy
              </Link>
              <Link href="/contact" className="hover:text-purple-600 transition-colors">
                Contact
              </Link>
            </div>
          </div>
        </footer>

        {/* ✅ Add Speed Insights tracker at the very bottom */}
        <SpeedInsights />
        <Analytics />   {/* ✅ Web Analytics */}
      </body>
    </html>
  );
}
