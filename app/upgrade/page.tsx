"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import CTAButton from "@/components/CTAButton";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Plan = "monthly" | "annual";
type Tier = "free" | "trial" | "premium";

export default function UpgradePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const justUpgraded = sp?.get("just") === "1"; // optional hint

  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [tier, setTier] = useState<Tier>("free");
  const [checking, setChecking] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Check current session tier
        const res = await fetch("/api/users/tier", { cache: "no-store" });
        if (res.status === 401) {
          // Not signed in → go login and come back here
          router.replace("/login?next=/upgrade");
          return;
        }
        const data = await res.json().catch(() => null);
        const t = (data?.tier as Tier) ?? "free";
        if (cancelled) return;

        setTier(t);

        // 2) If already premium → go home
        if (t === "premium") {
          setBanner("Welcome back! Redirecting to your dashboard…");
          setTimeout(() => router.replace("/dashboard"), 400);
          return;
        }

        // 3) If we were bounced here right after payment, poll briefly
        //    to avoid the whiplash blank screen.
        if (justUpgraded || document.referrer.includes("/upgrade/success")) {
          setBanner("Finalizing your Premium access…");
          const deadline = Date.now() + 7000; // up to 7s
          while (Date.now() < deadline) {
            const r = await fetch("/api/users/tier", { cache: "no-store" });
            if (r.status === 401) break;
            const j = await r.json().catch(() => null);
            if (j?.tier === "premium") {
              setBanner("All set! Taking you to your dashboard…");
              setTimeout(() => router.replace("/dashboard"), 400);
              return;
            }
            await new Promise((s) => setTimeout(s, 500));
          }
          // If still not premium, just show plans below (no blank state)
          setBanner(null);
        }
      } catch {
        setBanner("We’re having trouble checking your status. You can still upgrade below.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, justUpgraded]);

  async function handleUpgrade(plan: Plan) {
    setLoadingPlan(plan);
    setBanner(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 401) {
        router.push("/login?next=/upgrade");
        return;
      }
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
      } else {
        setBanner(json?.error || "Something went wrong starting checkout.");
      }
    } catch {
      setBanner("Network issue starting checkout. Try again.");
    } finally {
      setLoadingPlan(null);
    }
  }

  const disabled = useMemo(() => checking || tier === "premium" || loadingPlan !== null, [checking, tier, loadingPlan]);

  return (
    <main className="relative isolate overflow-hidden min-h-screen flex items-center justify-center bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] px-6 py-20">
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

        {/* Status banner (prevents blank page) */}
        {(checking || banner) && (
          <p className="mb-6 text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md px-3 py-2">
            {banner || "Checking your account…"}
          </p>
        )}

        {/* Pricing grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 shadow-lg border border-purple-200">
            <p className="text-5xl font-bold text-purple-700 mb-2">$15</p>
            <p className="text-gray-600 mb-4">per month</p>
            <CTAButton
              onClick={() => handleUpgrade("monthly")}
              variant="premium"
              disabled={disabled}
              className="text-lg px-6 py-3 w-full"
            >
              {tier === "premium" ? "You're Premium" : loadingPlan === "monthly" ? "Redirecting…" : "Choose Monthly"}
            </CTAButton>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-2xl p-6 shadow-lg border border-yellow-200">
            <p className="text-5xl font-bold text-yellow-600 mb-2">$100</p>
            <p className="text-gray-600 mb-1">per year</p>
            <p className="text-sm text-gray-500 mb-4">(Save 45%)</p>
            <CTAButton
              onClick={() => handleUpgrade("annual")}
              variant="secondary"
              disabled={disabled}
              className="text-lg px-6 py-3 w-full bg-yellow-400 hover:bg-yellow-500 text-purple-900 font-semibold"
            >
              {tier === "premium" ? "You're Premium" : loadingPlan === "annual" ? "Redirecting…" : "Choose Annual"}
            </CTAButton>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-500">100% secure checkout via Stripe • Cancel anytime</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10 text-left">
          {[
            "✓ Full access to AI-generated reports",
            "✓ Weekly personalized tweaks",
            "✓ Advanced stack tracking dashboard",
            "✓ Lifetime discount on affiliate partners",
          ].map((f, i) => (
            <p key={i} className="text-gray-700 text-sm">{f}</p>
          ))}
        </div>
      </motion.div>
    </main>
  );
}
