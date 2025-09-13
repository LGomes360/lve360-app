"use client";

import { useEffect, useState } from "react";
import CTAButton from "@/components/CTAButton";

export default function Pricing() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("email");
    if (e) setEmail(e);
  }, []);

  async function subscribe(plan: "premium") {
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
    <main className="max-w-4xl mx-auto py-16 px-6 text-center">
      <h1 className="text-4xl font-bold mb-6 text-[#041B2D]">Choose Your Plan</h1>
      <p className="text-gray-600 mb-12">
        Start free, then upgrade to unlock your full personalized concierge
        report and premium features.
      </p>

      {/* Email capture */}
      <div className="max-w-md mx-auto mb-12">
        <input
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg mb-4"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Free Plan */}
        <div className="border rounded-xl p-8 shadow-sm flex flex-col">
          <h2 className="text-2xl font-semibold mb-4 text-[#041B2D]">Free</h2>
          <p className="text-gray-600 mb-6">
            Get your intake quiz and a preview of your personalized report.
          </p>
          <p className="text-3xl font-bold mb-6 text-[#041B2D]">$0</p>
          <CTAButton href="/results" variant="secondary" fullWidth>
            Get Started
          </CTAButton>
        </div>

        {/* Premium Plan */}
        <div className="border-2 border-[#06C1A0] rounded-xl p-8 shadow-md flex flex-col relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#06C1A0] text-white px-3 py-1 rounded-full text-sm font-medium">
            Most Popular
          </div>
          <h2 className="text-2xl font-semibold mb-4 text-[#041B2D]">Premium</h2>
          <p className="text-gray-600 mb-6">
            Unlock your full concierge report, supplement stack, and lifestyle
            roadmap.
          </p>
          <p className="text-3xl font-bold mb-6 text-[#041B2D]">$9/mo</p>
          <CTAButton
            onClick={() => subscribe("premium")}
            variant="primary"
            fullWidth
          >
            Upgrade Now
          </CTAButton>
        </div>

        {/* Concierge Plan */}
        <div className="border rounded-xl p-8 shadow-sm flex flex-col">
          <h2 className="text-2xl font-semibold mb-4 text-[#041B2D]">
            Concierge
          </h2>
          <p className="text-gray-600 mb-6">
            Coming soon: direct access to LVE360 specialists and lab
            integrations.
          </p>
          <p className="text-3xl font-bold mb-6 text-[#041B2D]">TBD</p>
          <CTAButton variant="disabled" fullWidth>
            Coming Soon
          </CTAButton>
        </div>
      </div>
    </main>
  );
}
