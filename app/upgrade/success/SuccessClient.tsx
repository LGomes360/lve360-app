"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const sessionId = sp?.get("session_id") ?? null;

  const [msg, setMsg] = useState("Activating Premium…");

  useEffect(() => {
    if (!sessionId) {
      setMsg("Missing session. Returning…");
      router.replace("/upgrade");
      return;
    }

    (async () => {
      try {
        const handoff = await fetch("/api/blueprint-action", { cache: "no-store" })
          .then((response) => response.ok ? response.json() : null)
          .catch(() => null);
        const premiumDestination = handoff?.selected ? "/onboarding" : "/dashboard";

        // 1) Confirm with Stripe (cookie not required)
        const res = await fetch(`/api/stripe/confirm?session_id=${sessionId}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = await res.json();

        if (!json?.ok) {
          setMsg("We couldn’t verify your subscription. Taking you back…");
          setTimeout(() => router.replace("/upgrade"), 1000);
          return;
        }

        // Data we’ll use for polling when cookie is late
        const targetUserId: string | null = json.user_id ?? null;
        const premium: boolean = !!json.premium;

        // 2) Quick cookie check: can we read tier for *current* session?
        //    If this 401s, the cookie isn't available yet → go to login with next=/dashboard.
        const tierRes = await fetch("/api/users/tier", { cache: "no-store" });
        if (tierRes.status === 401) {
          setMsg("Almost done. Please confirm login...");
          router.replace(`/login?next=${encodeURIComponent(premiumDestination)}`);
          return;
        }

        // 3) If server session exists but still not premium (replication lag),
        //    poll /api/users/tier for the *target* userId for a few seconds.
        if (!premium && targetUserId) {
          setMsg("Finalizing your Premium access…");
          const deadline = Date.now() + 6000; // up to 6s
          let isPremium = false;

          while (Date.now() < deadline) {
            // use explicit userId so we don't depend on cookie yet
            const r = await fetch(`/api/users/tier?userId=${targetUserId}`, { cache: "no-store" });
            const j = await r.json().catch(() => null);
            if (j?.tier === "premium") {
              isPremium = true;
              break;
            }
            await new Promise((s) => setTimeout(s, 500));
          }

          if (isPremium) {
            setMsg(handoff?.selected ? "Welcome to Premium! Opening your first-week setup..." : "Welcome to Premium! Redirecting...");
            setTimeout(() => router.replace(premiumDestination), 600);
            return;
          }
        }

        // 4) Default success route
        setMsg(handoff?.selected ? "Welcome to Premium! Opening your first-week setup..." : "Welcome to Premium! Redirecting...");
        setTimeout(() => router.replace(premiumDestination), 600);
      } catch {
        setMsg("Network hiccup. Taking you back…");
        setTimeout(() => router.replace("/upgrade"), 1200);
      }
    })();
  }, [sessionId, router]);

  return (
    <main className="mx-auto max-w-xl p-8 text-center">
      <div className="text-3xl mb-4">🎉</div>
      <h1 className="text-xl font-semibold mb-2">Thanks for upgrading!</h1>
      <p className="text-gray-600">{msg}</p>
    </main>
  );
}

export default function SuccessClient() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-xl p-8 text-center">
          <div className="text-3xl mb-4">🎉</div>
          <h1 className="text-xl font-semibold mb-2">Thanks for upgrading!</h1>
          <p className="text-gray-600">Preparing your upgrade…</p>
        </main>
      }
    >
      <Inner />
    </Suspense>
  );
}
