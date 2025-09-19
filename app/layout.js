import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "LVE360",
  description: "Longevity | Vitality | Energy",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* ✅ back to neutral body */}
      <body className="min-h-screen flex flex-col bg-white text-gray-900">
        {/* Header */}
        <header className="bg-[#041B2D] text-white">
          <nav className="max-w-6xl mx-auto flex items-center justify-between py-4 px-4">
            <Link href="/" className="font-extrabold text-xl tracking-tight">
              LVE360
            </Link>
            <div className="space-x-6 text-sm sm:text-base">
              <Link href="/" className="hover:opacity-80">Home</Link>
              <Link href="/pricing" className="hover:opacity-80">Pricing</Link>
              <Link href="/results" className="hover:opacity-80">Results</Link>
            </div>
          </nav>
        </header>

        {/* Page content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="bg-gray-50 text-gray-600">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 py-4 px-4 text-sm">
            <p>© {new Date().getFullYear()} LVE360. All rights reserved.</p>
            <div className="space-x-4">
              <Link href="/terms" className="hover:text-gray-800">Terms</Link>
              <Link href="/privacy" className="hover:text-gray-800">Privacy</Link>
              <Link href="/contact" className="hover:text-gray-800">Contact</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
