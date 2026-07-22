"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { track } from "@vercel/analytics/react";
import CTAButton from "@/components/CTAButton";

/** REAL error boundary: catches render-time errors and shows fallback UI */
class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error("[/upgrade ErrorBoundary] render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <main className="mx-auto max-w-xl p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">We’re almost there</h1>
          <p className="text-gray-600 mb-4">
            Something went wrong loading this page. You can retry or log in again.
          </p>
          <div className="flex items-center justify-center gap-3">
            <a href="/upgrade" className="underline text-indigo-700">Try Again</a>
            <span className="text-gray-400">•</span>
            <a href="/login?next=/upgrade" className="underline text-indigo-700">Log In</a>
          </div>
        </main>
      );
    }
    return this.props.children as any;
  }
}

type Plan = "monthly" | "annual";
type Tier = "free" | "trial" | "premium";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams(); // safe inside Suspense
  const justUpgraded = sp?.get("just") === "1";
  const checkoutCanceled = sp?.get("canceled") === "1";
  const requestedPlan: Plan | null =
    sp?.get("plan") === "monthly" || sp?.get("plan") === "annual"
      ? (sp.get("plan") as Plan)
      : null;

  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [tier, setTier] = useState<Tier>("free");
  const [checking, setChecking] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<{ label: string; category: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const handoff = await fetch("/api/blueprint-action", { cache: "no-store" })
          .then((response) => response.ok ? response.json() : null)
          .catch(() => null);
        const action = handoff?.selected ?? null;
        if (!cancelled) setSelectedAction(action);
        const premiumDestination = action ? "/onboarding" : "/dashboard";

        console.log("[/upgrade] start check");
        let res = await fetch("/api/users/tier", { cache: "no-store" });
        console.log("[/upgrade] tier status:", res.status);

        if (res.status === 401) {
          console.log("[/upgrade] 401 → to login");
          const next = requestedPlan ? `/upgrade?plan=${requestedPlan}` : "/upgrade";
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }

        // If your /api/users/tier sometimes insists on userId, try to get it
        if (res.status === 400) {
          console.log("[/upgrade] 400 (tier) → fetch /api/user for id fallback");
          const who = await fetch("/api/user", { cache: "no-store" })
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null);
          if (who?.id) {
            res = await fetch(`/api/users/tier?userId=${encodeURIComponent(who.id)}`, { cache: "no-store" });
            console.log("[/upgrade] retried tier with userId, status:", res.status);
          }
        }

        let data: any = null;
        try { data = await res.json(); } catch { /* ignore */ }
        const t: Tier = (data?.tier as Tier) ?? "free";
        if (cancelled) return;

        console.log("[/upgrade] current tier:", t);
        setTier(t);

        if (t === "premium") {
          setBanner(action ? "Your first-week action is ready. Opening onboarding..." : "Welcome back! Redirecting to your dashboard...");
          console.log("[/upgrade] premium destination", premiumDestination);
          setTimeout(() => router.replace(premiumDestination), 400);
          return;
        }

        if (checkoutCanceled) {
          setBanner("Checkout was canceled. Nothing was charged, and your selected plan is still ready below.");
        } else if (requestedPlan && data?.user_id) {
          const label = requestedPlan === "annual" ? "Annual" : "Monthly";
          setBanner(`You're signed in. Continue with ${label} Checkout below.`);
        }

        // If bounced here immediately after Stripe success, poll for flip
        const cameFromSuccess = typeof document !== "undefined" && document.referrer.includes("/upgrade/success");
        if (justUpgraded || cameFromSuccess) {
          setBanner("Finalizing your Premium access…");
          const deadline = Date.now() + 9000; // up to 9s
          console.log("[/upgrade] polling for premium flip…");
          while (Date.now() < deadline) {
            let rr = await fetch("/api/users/tier", { cache: "no-store" });
            if (rr.status === 400) {
              const who = await fetch("/api/user", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
              if (who?.id) rr = await fetch(`/api/users/tier?userId=${encodeURIComponent(who.id)}`, { cache: "no-store" });
            }
            if (rr.status === 401) {
              console.log("[/upgrade] lost session during poll → to login");
              router.replace("/login?next=/dashboard");
              return;
            }
            const j = await rr.json().catch(() => null);
            if (j?.tier === "premium") {
              console.log("[/upgrade] premium flip destination", premiumDestination);
              setBanner(action ? "All set! Opening your first-week setup..." : "All set! Taking you to your dashboard...");
              setTimeout(() => router.replace(premiumDestination), 400);
              return;
            }
            await new Promise((s) => setTimeout(s, 500));
          }
          console.log("[/upgrade] no flip; show plans");
          setBanner(null); // show plans if still not premium
        }
      } catch (e) {
        console.error("[/upgrade] error during check:", e);
        setBanner("We’re having trouble checking your status. You can still upgrade below.");
      } finally {
        if (!cancelled) {
          setChecking(false);
          console.log("[/upgrade] check done");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [router, justUpgraded, requestedPlan, checkoutCanceled]);

  async function handleUpgrade(plan: Plan) {
    setLoadingPlan(plan);
    setBanner(null);
    track("Checkout Started", { plan, source: "upgrade" });
    try {
      console.log("[/upgrade] starting checkout:", plan);
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 401) {
        console.log("[/upgrade] 401 on checkout → to login");
        router.push(`/login?next=${encodeURIComponent(`/upgrade?plan=${plan}`)}`);
        return;
      }
      const json = await res.json();
      if (json?.url) {
        console.log("[/upgrade] redirecting to Stripe");
        window.location.href = json.url;
      } else {
        console.error("[/upgrade] checkout error payload:", json);
        setBanner(json?.error || "Something went wrong starting checkout.");
      }
    } catch (e) {
      console.error("[/upgrade] checkout network error:", e);
      setBanner("Network issue starting checkout. Try again.");
    } finally {
      setLoadingPlan(null);
    }
  }

  const disabled = useMemo(
    () => checking || tier === "premium" || loadingPlan !== null,
    [checking, tier, loadingPlan]
  );

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
        <h1 className="text-4xl font-extrabold text-[#041B2D] mb-3">Turn your Blueprint into a weekly practice</h1>
        <p className="text-gray-600 mb-6 text-lg">
          Keep your next action visible, learn from short check-ins, and build healthier routines one focused week at a time.
        </p>

        {(checking || banner) && (
          <p className="mb-6 text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md px-3 py-2">
            {banner || "Checking your account…"}
          </p>
        )}

        {selectedAction && (
          <div className="mb-7 rounded-2xl border border-[#9DCFC3] bg-[#EAFBF8] p-4 text-left">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#087F72]">Coming with you from your Blueprint</p>
            <p className="mt-2 font-semibold leading-6 text-[#041B2D]">{selectedAction.label}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">After checkout, we will use this to start your first week.</p>
          </div>
        )}

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
              {tier === "premium" ? "You're Premium" : loadingPlan === "monthly" ? "Redirecting…" : requestedPlan === "monthly" ? "Continue Monthly Checkout" : "Choose Monthly"}
            </CTAButton>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-2xl p-6 shadow-lg border border-yellow-200">
            <p className="text-5xl font-bold text-yellow-600 mb-2">$100</p>
            <p className="text-gray-600 mb-1">per year</p>
            <p className="text-sm text-gray-500 mb-4">Save $80 each year</p>
            <CTAButton
              onClick={() => handleUpgrade("annual")}
              variant="secondary"
              disabled={disabled}
              className="text-lg px-6 py-3 w-full bg-yellow-400 hover:bg-yellow-500 text-purple-900 font-semibold"
            >
              {tier === "premium" ? "You're Premium" : loadingPlan === "annual" ? "Redirecting…" : requestedPlan === "annual" ? "Continue Annual Checkout" : "Choose Annual"}
            </CTAButton>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-500">Secure checkout through Stripe. Cancel anytime from Account &gt; Manage Billing.</p>
        <p className="mt-2 text-xs leading-5 text-gray-500">Stripe receives your account email and billing details, not your supplement, medication, or health-profile answers.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10 text-left">
          {[
            "✓ Everything in your free Blueprint",
            "✓ One focused weekly practice",
            "✓ Today's active plan and optional check-ins",
            "✓ Progress review and ongoing updates",
          ].map((f, i) => (
            <p key={i} className="text-gray-700 text-sm">{f}</p>
          ))}
        </div>

        {/* last-resort manual actions so you NEVER look stuck */}
        <div className="mt-8 flex items-center justify-center gap-4 text-sm">
          <button
            onClick={() => router.replace("/dashboard")}
            className="underline text-indigo-700"
          >
            Go to Dashboard
          </button>
          <span className="text-gray-400">•</span>
          <a href="/login?next=/dashboard" className="underline text-indigo-700">
            Log in again
          </a>
        </div>
      </motion.div>
    </main>
  );
}

export default function UpgradeClient() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-xl p-8 text-center">
          <div className="text-3xl mb-4">🎉</div>
          <h1 className="text-xl font-semibold mb-2">Unlock LVE360 Premium</h1>
          <p className="text-gray-600">Preparing your upgrade…</p>
        </main>
      }
    >
      <PageErrorBoundary>
        <Inner />
      </PageErrorBoundary>
    </Suspense>
  );
}
