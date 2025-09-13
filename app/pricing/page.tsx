"use client";

import { useEffect, useState } from "react";
import PlanCard from "@/components/PlanCard";

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

      {/* Plan grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
        <PlanCard
          title="Free"
          description="Get your intake quiz and a preview of your personalized report."
          price="$0"
          variant="free"
          buttonText="Get Started"
          buttonHref="/results"
        />

        <PlanCard
          title="Premium"
          description="Unlock your full concierge report, supplement stack, and lifestyle roadmap."
          price="$9/mo"
          variant="premium"
          badge="Most Popular"
          buttonText="Upgrade Now"
          buttonAction={() => subscribe("premium")}
        />

        <PlanCard
          title="Concierge"
          description="Coming soon: direct access to LVE360 specialists and lab integrations."
          price="TBD"
          variant="concierge"
          buttonText="Coming Soon"
          disabled
        />
      </div>
    </main>
  );
}
