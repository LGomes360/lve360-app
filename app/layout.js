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
        {/* Sticky header with soft shadow */}
        <header className="sticky top-0 z-40 bg-[#041B2D]/95 backdrop-blur supports-[backdrop-filter]:bg-[#041B2D]/80 text-white shadow-sm">
          <nav className="max-w-6xl mx-auto flex items-center justify-between py-4 px-4">
            <Link href="/" className="font-extrabold text-xl tracking-tight">
              LVE360
            </Link>
            <div className="space-x-6 text-sm sm:text-base">
              <Link href="/" className="hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded">Home</Link>
              <Link href="/pricing" className="hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded">Pricing</Link>
              <Link href="/results" className="hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded">Results</Link>
            </div>
          </nav>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="bg-gray-50 text-gray-600">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 py-6 px-4 text-sm">
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
