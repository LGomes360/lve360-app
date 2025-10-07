"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import CTAButton from "@/components/CTAButton";

export default function UpgradePage() {
  const [loading, setLoading] = useState<string | null>(null);

  // Generic checkout handler
  async function handleUpgrade(plan: "monthly" | "annual") {
    setLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId:
            plan === "monthly"
              ? process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY
              : process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL,
        }),
      });

      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert("Something went wrong creating your checkout session.");
      }
    } catch (err) {
      console.error("Checkout failed:", err);
      alert("Checkout failed. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="relative isolate overflow-hidden min-h-screen flex items-center justify-center bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] px-6 py-20">
      {/* Floating soft blobs */}
      <div
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#A8F0E4] opacity-40 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-[18rem] -right-24 h-[28rem] w-[28rem] rounded-full bg-[#D9C2F0] opacity-40 blur-3xl"
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-xl w-full bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl ring-1 ring-purple-100 p-10 text-center"
      >
        <h1 className="text-4xl font-extrabold text-[#041B2D] mb-3">
          Unlock LVE360 Premium
        </h1>
        <p className="text-gray-600 mb-8 text-lg">
          Go beyond your free report with personalized weekly tweaks, AI-guided
          recommendations, and your private dashboard.
        </p>

        {/* Pricing Display */}
        <div className="grid sm:grid-cols-2 gap-6 mb-8">
          {/* Monthly Plan */}
          <div className="border rounded-xl p-6 hover:shadow-lg transition bg-gradient-to-b from-purple-50 to-white">
            <p className="text-5xl font-bold text-purple-600 mb-2">$15</p>
            <p className="text-gray-500 mb-4">per month</p>
            <CTAButton
              onClick={() => handleUpgrade("monthly")}
              variant="premium"
              disabled={loading !== null}
              className="w-full py-3"
            >
              {loading === "monthly" ? "Redirecting..." : "Choose Monthly"}
            </CTAButton>
          </div>

          {/* Annual Plan */}
          <div className="border rounded-xl p-6 hover:shadow-lg transition bg-gradient-to-b from-yellow-50 to-white">
            <p className="text-5xl font-bold text-yellow-600 mb-2">$100</p>
            <p className="text-gray-500 mb-1">per year</p>
            <p className="text-xs text-purple-500 mb-4">(Save 45%)</p>
            <CTAButton
              onClick={() => handleUpgrade("annual")}
              variant="secondary"
              disabled={loading !== null}
              className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 text-purple-900 font-semibold"
            >
              {loading === "annual" ? "Redirecting..." : "Choose Annual"}
            </CTAButton>
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-10">
          100% secure checkout via Stripe • Cancel anytime
        </p>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          {[
            "✓ Full access to AI-generated reports",
            "✓ Weekly personalized tweaks",
            "✓ Advanced stack tracking dashboard",
            "✓ Lifetime discount on affiliate partners",
          ].map((feature, i) => (
            <p key={i} className="text-gray-700 text-sm">
              {feature}
            </p>
          ))}
        </div>
      </motion.div>
    </main>
  );
}
