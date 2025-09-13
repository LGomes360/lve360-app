"use client";

import { useEffect, useState } from "react";
import CTAButton from "@/components/CTAButton";

export default function Pricing() {
  const [email, setEmail] = useState("");

  // Pre-fill email from ?email=...
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

    // Go to Stripe Checkout
    window.location.href = data.url;
  }

  return (
    <main className="max-w-xl mx-auto py-12 px-6 text-center">
      <h1 className="text-3xl font-bold mb-4 text-[#041B2D]">LVE360 Premium</h1>
      <p className="text-lg text-gray-700 mb-6">
        <span className="font-semibold">$9/month</span> • Unlock exact dosing,
        med spacing, and weekly tweaks.
      </p>

      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full border rounded-lg px-4 py-2 mb-4"
      />

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <CTAButton onClick={subscribe} variant="primary">
          Subscribe
        </CTAButton>
        <CTAButton href="/" variant="secondary">
          Back to Home
        </CTAButton>
      </div>
    </main>
  );
}
