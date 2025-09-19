import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "LVE360",
  description: "Longevity | Vitality | Energy",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-red-500 text-white">

        {/* Header */}
        <header className="bg-brand-dark shadow-md">
          <nav className="max-w-6xl mx-auto flex justify-between items-center px-6 py-4">
            <Link href="/" className="text-2xl font-display font-bold text-brand-light">
              LVE360
            </Link>
            <div className="space-x-8 text-sm font-medium">
              <Link href="/" className="hover:text-brand-light transition">Home</Link>
              <Link href="/pricing" className="hover:text-brand-light transition">Pricing</Link>
              <Link href="/results" className="hover:text-brand-light transition">Results</Link>
            </div>
          </nav>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col items-center justify-center text-center px-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-brand-dark text-gray-300 py-6 text-sm">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 px-6">
            <p>© {new Date().getFullYear()} LVE360. All rights reserved.</p>
            <div className="space-x-6">
              <Link href="/terms" className="hover:text-brand-light">Terms</Link>
              <Link href="/privacy" className="hover:text-brand-light">Privacy</Link>
              <Link href="/contact" className="hover:text-brand-light">Contact</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
