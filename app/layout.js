import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "LVE360",
  description: "Longevity | Vitality | Energy",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-gray-900">
        {/* Sticky header */}
        <header className="sticky top-0 z-40 bg-[#041B2D]/95 backdrop-blur supports-[backdrop-filter]:bg-[#041B2D]/80 text-white shadow-md">
          <nav className="max-w-6xl mx-auto flex items-center justify-between py-4 px-4">
            {/* Logo / Brand */}
            <Link
              href="/"
              className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-[#06C1A0] to-purple-500 bg-clip-text text-transparent"
            >
              LVE360
            </Link>

            {/* Nav Links */}
            <div className="space-x-6 text-sm sm:text-base flex items-center">
              <Link
                href="/"
                className="hover:text-[#06C1A0] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded"
              >
                Home
              </Link>
              <Link
                href="/pricing"
                className="hover:text-purple-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded"
              >
                Pricing
              </Link>
              <Link
                href="/login"
                className="bg-[#06C1A0] px-3 py-1.5 rounded-lg font-medium text-white hover:bg-[#049e84] transition-colors shadow-sm"
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
              <span className="font-semibold text-[#041B2D]">LVE360</span>. All
              rights reserved.
            </p>
            <div className="space-x-4">
              <Link
                href="/terms"
                className="hover:text-[#06C1A0] transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/privacy"
                className="hover:text-purple-500 transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/contact"
                className="hover:text-[#06C1A0] transition-colors"
              >
                Contact
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
