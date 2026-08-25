import "./globals.css";
import Link from "next/link";
import { SpeedInsights } from "@vercel/speed-insights/next"; // ✅ Added import
import { Analytics } from "@vercel/analytics/react";
import { PublicSiteFooter, PublicSiteHeader } from "@/components/PublicSiteChrome";

const canonicalUrl = "https://app.lve360.com";

export const metadata = {
  metadataBase: new URL(canonicalUrl),
  title: {
    default: "LVE360 | Know what matters today",
    template: "%s | LVE360",
  },
  description: "Start with a free personalized health Blueprint. Use LVE360 membership to choose the next useful action, understand why it matters, and learn what works.",
  alternates: {
    canonical: "./",
  },
  openGraph: {
    type: "website",
    url: canonicalUrl,
    siteName: "LVE360",
    title: "LVE360 | Know what matters today",
    description: "Start with a free personalized health Blueprint. Use LVE360 membership to choose the next useful action, understand why it matters, and learn what works.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LVE360 | Know what matters today",
    description: "Start with a free personalized health Blueprint. Use LVE360 membership to choose the next useful action, understand why it matters, and learn what works.",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-gray-900">
        <PublicSiteHeader />

        {/* Main body */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <PublicSiteFooter><footer className="bg-gray-50 text-gray-600 border-t border-gray-200">
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
              <Link href="/medical-disclaimer" className="hover:text-purple-600 transition-colors">
                Medical Disclaimer
              </Link>
              <Link href="/contact" className="hover:text-purple-600 transition-colors">
                Contact
              </Link>
            </div>
          </div>
        </footer></PublicSiteFooter>

        {/* ✅ Add Speed Insights tracker at the very bottom */}
        <SpeedInsights />
        <Analytics />   {/* ✅ Web Analytics */}
      </body>
    </html>
  );
}
