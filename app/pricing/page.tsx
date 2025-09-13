"use client";

import { useEffect, useState } from "react";
import CTAButton from "@/components/CTAButton";

export default function Pricing() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("email");
    if (e) setEmail(e);
  }, []);

  async function subscribe() {
    if (!email) {
      alert("Please enter your email");
      return;
    }

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, plan: "premium" }),
    });

    const data = await res.json();
    if (!res.ok || !data?.url) {
      alert(data?.error || "Checkout error");
      return;
    }

    window.location.href = data.url;
  }

  return (
    <main className="max-w-3xl mx-auto py-12 px-6 text-center">
      <h1 className="text-3xl font-bold mb-6 text-[#041B2D]">LVE360 Pricing</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Free Tier */}
        <div className="border rounded-lg p-6 bg-gray-50">
          <h2 className="text-xl font-semibold mb-2">Free</h2>
          <p className="text-gray-600 mb-4">Basic insights, quiz results.</p>
          <ul className="text-left text-gray-700 space-y-2">
            <li>✓ Current Analysis</li>
            <li>✓ Contraindications</li>
            <li>✓ Bang-for-Buck picks</li>
            <li>✗ Personalized Stack</li>
            <li>✗ Weekly Tweaks</li>
          </ul>
        </div>

        {/* Premium Tier */}
        <div className="border rounded-lg p-6 bg-white shadow-md">
          <h2 className="text-xl font-semibold mb-2">Premium</h2>
          <p className="text-gray-600 mb-4">$9/month • Cancel anytime</p>
          <ul className="text-left text-gray-700 space-y-2 mb-6">
            <li>✓ Everything in Free</li>
            <li>✓ Personalized Stack</li>
            <li>✓ Lifestyle & Longevity Notes</li>
            <li>✓ Weekly Tweaks</li>
            <li>✓ Dashboard Snapshot</li>
          </ul>

          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-4 py-2 mb-4"
          />

          <CTAButton onClick={subscribe} variant="primary">
            Subscribe with Stripe
          </CTAButton>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Payments are processed securely by Stripe. Cancel anytime from your
        account.
      </p>

      <div className="mt-6">
        <CTAButton href="/" variant="secondary">
          Back to Home
        </CTAButton>
      </div>
    </main>
  );
}
