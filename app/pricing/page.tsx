//app/pricing/page.tsx

"use client";

import { useEffect, useState } from "react";
import { Leaf, Gem, Lock, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
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
    <main className="relative max-w-6xl mx-auto py-20 px-6 text-center">
      {/* Background Gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#EAFBF8] via-white to-[#F8F5FB]" />

      {/* DNA Watermark */}
      <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-5 pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="420"
          height="420"
          viewBox="0 0 200 200"
          className="text-[#06C1A0]"
        >
          <path
            d="M50,20 C90,80 110,120 150,180
               M150,20 C110,80 90,120 50,180"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
        </svg>
      </div>

      {/* Hero */}
      <div className="mb-16 relative">
        <h1 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-[#041B2D] via-purple-600 to-[#06C1A0] bg-clip-text text-transparent tracking-tight drop-shadow-sm">
          Choose Your Path
        </h1>
        <p className="text-xl text-gray-700 max-w-2xl mx-auto">
          Unlock{" "}
          <span className="text-[#06C1A0] font-semibold">Longevity</span>, ignite{" "}
          <span className="text-purple-600 font-semibold">Vitality</span>, and
          power up your{" "}
          <span className="text-yellow-500 font-semibold">Energy</span>.  
          Your journey starts here.
        </p>
      </div>

      {/* Pricing Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
        {/* Free Tier */}
        <motion.div
          whileHover={{ scale: 1.03 }}
          transition={{ type: "spring", stiffness: 200, damping: 14 }}
          className="relative rounded-2xl border border-gray-200 p-8 bg-gray-50 flex flex-col shadow-sm hover:shadow-md transition"
        >
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-[#06C1A0]/10 flex items-center justify-center">
            <Leaf className="text-[#06C1A0]" size={28} />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Free</h2>
          <p className="text-gray-600 mb-6">Longevity starts here.</p>
          <ul className="text-left text-gray-700 space-y-2 mb-6">
            <li>✓ Current Analysis</li>
            <li>✓ Contraindications</li>
            <li>✓ Bang-for-Buck picks</li>
            <li className="text-gray-400">✗ Personalized Stack</li>
            <li className="text-gray-400">✗ Weekly Tweaks</li>
          </ul>
          <CTAButton href="/quiz" variant="secondary" fullWidth>
            Get Started
          </CTAButton>
        </motion.div>

        {/* Premium Tier */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 200, damping: 14 }}
          className="relative rounded-2xl border-2 border-[#06C1A0] p-8 bg-white flex flex-col shadow-lg hover:shadow-xl transition"
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#06C1A0] text-white px-3 py-1 rounded-full text-sm font-medium shadow">
            Most Popular
          </div>
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-[#06C1A0]/10 flex items-center justify-center">
            <Gem className="text-[#06C1A0]" size={28} />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Premium</h2>
          <p className="text-gray-600 mb-6">Vitality unlocked • $15/month</p>
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
        </motion.div>
      </div>

      {/* Why Upgrade Section */}
      <section className="max-w-5xl mx-auto py-12 text-center">
        <h2 className="text-3xl font-bold text-[#041B2D] mb-10">Why Upgrade?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { icon: "📖", text: "Evidence-based supplement insights" },
            { icon: "⚡", text: "Weekly AI-driven tweaks" },
            { icon: "💡", text: "Save time & money with clarity" },
          ].map((item) => (
            <motion.div
              key={item.text}
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 200, damping: 12 }}
              className="rounded-xl bg-white p-6 shadow hover:shadow-md transition"
            >
              <div className="text-3xl mb-2">{item.icon}</div>
              <p className="text-gray-700">{item.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer note */}
      <div className="flex flex-col items-center space-y-3 mt-8">
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Lock size={14} className="text-gray-400" />
          Payments are processed securely by Stripe. Cancel anytime.
        </p>
        <CTAButton href="/" variant="secondary">
          Back to Home
        </CTAButton>
      </div>
    </main>
  );
}
