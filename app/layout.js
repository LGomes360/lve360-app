import "./globals.css";
import Link from "next/link";
import { SpeedInsights } from "@vercel/speed-insights/next"; // ✅ Added import
import { Analytics } from "@vercel/analytics/react";
import { PublicSiteFooter, PublicSiteHeader } from "@/components/PublicSiteChrome";
import { ProductModeProvider } from "@/components/ProductModeProvider";
import { getProductMode } from "@/lib/productMode";

const canonicalUrl = "https://app.lve360.com";

export const metadata = {
  metadataBase: new URL(canonicalUrl),
  title: {
    default: "LVE360 | Know what matters today",
    template: "%s | LVE360",
  },
  description: "Build a free personal health Blueprint and keep the health information you choose to share organized around longevity, vitality, and energy.",
  alternates: {
    canonical: "./",
  },
  openGraph: {
    type: "website",
    url: canonicalUrl,
    siteName: "LVE360",
    title: "LVE360 | Know what matters today",
    description: "Build a free personal health Blueprint and keep the health information you choose to share organized around longevity, vitality, and energy.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LVE360 | Know what matters today",
    description: "Build a free personal health Blueprint and keep the health information you choose to share organized around longevity, vitality, and energy.",
  },
};

export default function RootLayout({ children }) {
  const productMode = getProductMode();
  const publicProductMode = {
    accessMode: productMode.accessMode,
    publicPricingEnabled: productMode.publicPricingEnabled,
    publicSignupEnabled: productMode.publicSignupEnabled,
    billingCheckoutEnabled: productMode.billingCheckoutEnabled,
  };

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-gray-900">
        <ProductModeProvider value={publicProductMode}>
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
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                {productMode.accessMode === "invite_only" ? (
                  <>
                    <Link href="/#blueprint" className="hover:text-purple-600 transition-colors">Blueprint</Link>
                    <Link href="/request-invitation" className="hover:text-purple-600 transition-colors">Request invitation</Link>
                    <Link href="/login" className="hover:text-purple-600 transition-colors">Log in</Link>
                  </>
                ) : null}
                <Link href="/privacy" className="hover:text-purple-600 transition-colors">Privacy</Link>
                <Link href="/consumer-health-data-privacy" className="hover:text-purple-600 transition-colors">Consumer Health Data Privacy</Link>
                <Link href="/terms" className="hover:text-purple-600 transition-colors">Terms</Link>
                <Link href="/medical-disclaimer" className="hover:text-purple-600 transition-colors">Medical Disclaimer</Link>
                <Link href="/contact" className="hover:text-purple-600 transition-colors">Contact</Link>
              </div>
            </div>
          </footer></PublicSiteFooter>
        </ProductModeProvider>

        {/* ✅ Add Speed Insights tracker at the very bottom */}
        <SpeedInsights />
        <Analytics />   {/* ✅ Web Analytics */}
      </body>
    </html>
  );
}
