"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import CTAButton from "@/components/CTAButton";

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade(plan: string) {
    setLoading(true);
    try {
      const email = prompt("Enter your email to continue:");
      if (!email) return alert("Email is required to upgrade.");

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, email }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert("Something went wrong creating your checkout session.");
    } catch (err) {
      console.error(err);
      alert("Checkout failed. Try again.");
    } finally {
      setLoading(false);
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
        <div className="mb-8">
          <p className="text-5xl font-bold text-purple-600 mb-2">$15</p>
          <p className="text-gray-500">per month</p>
          <p className="text-sm text-gray-400 mt-1">
            (Annual option coming soon)
          </p>
        </div>

        {/* CTA */}
        <CTAButton
          onClick={() => handleUpgrade("premium")}
          variant="premium"
          disabled={loading}
          className="text-lg px-6 py-3"
        >
          {loading ? "Redirecting..." : "Upgrade to Premium"}
        </CTAButton>

        <p className="mt-4 text-sm text-gray-500">
          100% secure checkout via Stripe • Cancel anytime
        </p>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10 text-left">
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
