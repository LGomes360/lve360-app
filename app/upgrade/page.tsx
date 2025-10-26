"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import CTAButton from "@/components/CTAButton";

type Plan = "monthly" | "annual";
type Tier = "free" | "trial" | "premium";

export default function UpgradePage() {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [tier, setTier] = useState<Tier>("free");
  const [checking, setChecking] = useState(true); // page boot state
  const [error, setError] = useState<string | null>(null);

  // Fetch current user tier (uses your /api/users/tier route; works w/ or w/o userId)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/users/tier", { cache: "no-store" });
        if (res.status === 401) {
          // Not signed in → send to login and come back here after
          router.replace("/login?next=/upgrade");
          return;
        }
        const data = await res.json();
        const t = (data?.tier ?? "free") as Tier;
        setTier(t);
        if (t === "premium") {
          // Already premium → go home
          router.replace("/dashboard");
          return;
        }
      } catch (e) {
        setError("Could not check your status. Please refresh.");
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);

  // Start checkout (server binds to current session; no email prompts)
  async function handleUpgrade(plan: Plan) {
    setLoadingPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }), // only plan; server reads session user
      });

      if (res.status === 401) {
        router.push("/login?next=/upgrade");
        return;
      }

      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url; // Go to Stripe Checkout
      } else {
        setError(json?.error || "Something went wrong starting checkout.");
      }
    } catch {
      setError("Network issue starting checkout. Try again.");
    } finally {
      setLoadingPlan(null);
    }
  }

  const isPremium = tier === "premium";
  const isTrial = tier === "trial";

  // UI helpers
  const monthlyDisabled = useMemo(() => checking || isPremium || loadingPlan !== null, [checking, isPremium, loadingPlan]);
  const annualDisabled  = monthlyDisabled;

  return (
    <main className="relative isolate overflow-hidden min-h-screen flex items-center justify-center bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] px-6 py-20">
      {/* soft blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#A8F0E4] opacity-40 blur-3xl" />
      <div className="pointer-events-none absolute top-[18rem] -right-24 h-[28rem] w-[28rem] rounded-full bg-[#D9C2F0] opacity-40 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 max-w-xl w-full bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl ring-1 ring-purple-100 p-10 text-center"
      >
        <h1 className="text-4xl font-extrabold text-[#041B2D] mb-3">Unlock LVE360 Premium</h1>
        <p className="text-gray-600 mb-6 text-lg">
          Go beyond your free report with weekly personalized tweaks, AI guidance, and your private dashboard.
        </p>

        {/* Status strip */}
        {checking && (
          <p className="mb-6 text-sm text-gray-500">Checking your account…</p>
        )}
        {!checking && isTrial && (
          <p className="mb-6 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            You’re on a trial. Upgrade any time to keep your streaks and unlock everything.
          </p>
        )}
        {error && (
          <p className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {/* Pricing grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          {/* Monthly */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 shadow-lg border border-purple-200">
            <p className="text-5xl font-bold text-purple-700 mb-2">$15</p>
            <p className="text-gray-600 mb-4">per month</p>
            <CTAButton
              onClick={() => handleUpgrade("monthly")}
              variant="premium"
              disabled={monthlyDisabled}
              className="text-lg px-6 py-3 w-full"
            >
              {isPremium ? "You're Premium" : loadingPlan === "monthly" ? "Redirecting…" : "Choose Monthly"}
            </CTAButton>
          </div>

          {/* Annual */}
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-2xl p-6 shadow-lg border border-yellow-200">
            <p className="text-5xl font-bold text-yellow-600 mb-2">$100</p>
            <p className="text-gray-600 mb-1">per year</p>
            <p className="text-sm text-gray-500 mb-4">(Save 45%)</p>
            <CTAButton
              onClick={() => handleUpgrade("annual")}
              variant="secondary"
              disabled={annualDisabled}
              className="text-lg px-6 py-3 w-full bg-yellow-400 hover:bg-yellow-500 text-purple-900 font-semibold"
            >
              {isPremium ? "You're Premium" : loadingPlan === "annual" ? "Redirecting…" : "Choose Annual"}
            </CTAButton>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-500">
          100% secure checkout via Stripe • Cancel anytime
        </p>

        {/* Feature highlights */}
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
