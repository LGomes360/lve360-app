"use client";

import { useEffect, useState } from "react";
import { Leaf, Gem, Zap } from "lucide-react"; // Icons: Longevity, Vitality, Energy
import CTAButton from "@/components/CTAButton";

export default function Pricing() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("email");
    if (e) setEmail(e);
  }, []);

  async function subscribe(plan: "premium" | "concierge") {
    if (!email) {
      alert("Please enter your email");
      return;
    }

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, plan }),
    });

    const data = await res.json();
    if (!res.ok || !data?.url) {
      alert(data?.error || "Checkout error");
      return;
    }

    window.location.href = data.url;
  }

  return (
    <main className="max-w-5xl mx-auto py-16 px-6 text-center">
      <h1 className="text-4xl font-extrabold mb-10 text-[#041B2D]">
        LVE360 Pricing
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
        {/* Free Tier — Longevity */}
        <div className="relative rounded-2xl border border-gray-200 p-8 bg-gray-50 flex flex-col shadow-sm">
          <Leaf className="mx-auto mb-4 text-[#06C1A0]" size={36} />
          <h2 className="text-2xl font-semibold mb-4">Free</h2>
          <p className="text-gray-600 mb-6">Longevity starts here.</p>
          <ul className="text-left text-gray-700 space-y-2 mb-6">
            <li>✓ Current Analysis</li>
            <li>✓ Contraindications</li>
            <li>✓ Bang-for-Buck picks</li>
            <li>✗ Personalized Stack</li>
            <li>✗ Weekly Tweaks</li>
          </ul>
          <CTAButton href="/quiz" variant="secondary" fullWidth>
            Get Started
          </CTAButton>
        </div>

        {/* Premium Tier — Vitality */}
        <div className="relative rounded-2xl border-2 border-[#06C1A0] p-8 bg-white flex flex-col shadow-lg">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#06C1A0] text-white px-3 py-1 rounded-full text-sm font-medium">
            Most Popular
          </div>
          <Gem className="mx-auto mb-4 text-[#06C1A0]" size={36} />
          <h2 className="text-2xl font-semibold mb-4">Premium</h2>
          <p className="text-gray-600 mb-6">Vitality unlocked • $9/month</p>
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
          <CTAButton onClick={() => subscribe("premium")} variant="primary" fullWidth>
            Subscribe with Stripe
          </CTAButton>
        </div>

        {/* Concierge Tier — Energy */}
        <div className="relative rounded-2xl border-2 border-[#D4AF37] p-8 bg-black flex flex-col shadow-lg text-[#D4AF37]">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#D4AF37] text-black px-3 py-1 rounded-full text-sm font-medium">
            VIP Access
          </div>
          <Zap className="mx-auto mb-4 text-[#D4AF37]" size={36} />
          <h2 className="text-2xl font-semibold mb-4">Concierge</h2>
          <p className="mb-6">$99/month • Energy redefined</p>
          <ul className="text-left space-y-2 mb-6">
            <li>✓ Everything in Premium</li>
            <li>✓ One-on-One Consults</li>
            <li>✓ Lab Review & Protocols</li>
            <li>✓ Priority Support</li>
            <li>✓ Exclusive Product Access</li>
          </ul>
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-[#D4AF37] bg-black text-[#D4AF37] rounded-lg px-4 py-2 mb-4 placeholder-gray-500"
          />
          <CTAButton
            onClick={() => subscribe("concierge")}
            variant="concierge"
            fullWidth
          >
            Join Concierge
          </CTAButton>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Payments are processed securely by Stripe. Cancel anytime from your account.
      </p>

      <div className="mt-6">
        <CTAButton href="/" variant="secondary">
          Back to Home
        </CTAButton>
      </div>
    </main>
  );
}
