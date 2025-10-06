//lve360-app/app/upgrade/page.tsx//
"use client";

import { useState } from "react";
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
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-xl w-full bg-white shadow-lg rounded-2xl p-8 text-center">
        <h1 className="text-3xl font-bold text-purple-700 mb-4">
          Unlock LVE360 Premium
        </h1>
        <p className="text-gray-600 mb-6">
          Get full access to your personalized supplement stack, dosing
          schedules, premium AI insights, and affiliate discounts.
        </p>
        <CTAButton
          onClick={() => handleUpgrade("premium")}
          variant="premium"
          disabled={loading}
        >
          {loading ? "Redirecting..." : "Upgrade to Premium"}
        </CTAButton>
        <p className="mt-4 text-sm text-gray-500">
          100% secure checkout via Stripe • Cancel anytime
        </p>
      </div>
    </main>
  );
}
