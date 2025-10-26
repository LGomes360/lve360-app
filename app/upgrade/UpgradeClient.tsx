"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import CTAButton from "@/components/CTAButton";

// --- Simple client-side error boundary to avoid blank screen ---
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [err, setErr] = useState<Error | null>(null);
  if (err) {
    return (
      <main className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-semibold mb-2">We’re almost there</h1>
        <p className="text-gray-600 mb-4">
          Something went wrong loading this page. Try reloading, or log in again.
        </p>
        <a href="/login?next=/upgrade" className="underline text-indigo-700">Log in</a>
      </main>
    );
  }
  return (
    <ErrorCatcher onError={setErr}>
      {children}
    </ErrorCatcher>
  );
}
function ErrorCatcher({
  children,
  onError,
}: {
  children: React.ReactNode;
  onError: (e: Error) => void;
}) {
  // Wrap children in a try/catch-like effect for render-time errors
  // (React 18 client workaround)
  try {
    // eslint-disable-next-line react/jsx-no-useless-fragment
    return <>{children}</>;
  } catch (e: any) {
    onError(e);
    return null;
  }
}

type Plan = "monthly" | "annual";
type Tier = "free" | "trial" | "premium";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams(); // safe inside Suspense
  const justUpgraded = sp?.get("just") === "1";

  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [tier, setTier] = useState<Tier>("free");
  const [checking, setChecking] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Try cookie-based tier (works if session present)
        let res = await fetch("/api/users/tier", { cache: "no-store" });

        if (res.status === 401) {
          // Not signed in → send to login gracefully
          router.replace("/login?next=/upgrade");
          return;
        }

        // If your /api/users/tier sometimes returns 400 when userId missing,
        // we fall back to reading the current userId from /api/user.
        if (res.status === 400) {
          const who = await fetch("/api/user", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
          if (who?.id) {
            res = await fetch(`/api/users/tier?userId=${encodeURIComponent(who.id)}`, { cache: "no-store" });
          }
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

        // 3) If bounced here right after payment, poll briefly for flip
        if (justUpgraded || document.referrer.includes("/upgrade/success")) {
          setBanner("Finalizing your Premium access…");
          const deadline = Date.now() + 8000; // up to 8s
          while (Date.now() < deadline) {
            let rr = await fetch("/api/users/tier", { cache: "no-store" });
            if (rr.status === 400) {
              const who = await fetch("/api/user", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
              if (who?.id) {
                rr = await fetch(`/api/users/tier?userId=${encodeURIComponent(who.id)}`, { cache: "no-store" });
              }
            }
            if (rr.status === 401) break;
            const j = await rr.json().catch(() => null);
            if (j?.tier === "premium") {
              setBanner("All set! Taking you to your dashboard…");
              setTimeout(() => router.replace("/dashboard"), 400);
              return;
            }
            await new Promise((s) => setTimeout(s, 500));
          }
          setBanner(null); // show plans if still not premium
        }
      } catch {
        setBanner("We’re having trouble checking your status. You can still upgrade below.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
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
      if (json?.url) window.location.href = json.url;
      else setBanner(json?.error || "Something went wrong starting checkout.");
    } catch {
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
        <h1 className="text-4xl font-extrabold text-[#041B2D] mb-3">Unlock LVE360 Premium</h1>
        <p className="text-gray-600 mb-6 text-lg">
          Go beyond your free report with weekly personalized tweaks, AI guidance, and your private dashboard.
        </p>

        {(checking || banner) && (
          <p className="mb-6 text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md px-3 py-2">
            {banner || "Checking your account…"}
          </p>
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
      <ErrorBoundary>
        <Inner />
      </ErrorBoundary>
    </Suspense>
  );
}
