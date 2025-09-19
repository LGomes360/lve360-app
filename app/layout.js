import './globals.css'
import Link from "next/link";

export const metadata = {
  title: "LVE360",
  description: "Longevity | Vitality | Energy",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-[#041B2D] text-white py-4">
          <nav className="max-w-5xl mx-auto flex justify-between px-4">
            <Link href="/" className="font-bold text-lg">
              LVE360
            </Link>
            <div className="space-x-6">
              <Link href="/">Home</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/results">Results</Link>
            </div>
          </nav>
        </header>

        {/* Main content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="bg-gray-100 text-gray-600 py-4 text-center text-sm">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between px-4">
            <p>© {new Date().getFullYear()} LVE360. All rights reserved.</p>
            <div className="space-x-4">
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
