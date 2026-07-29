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
        const premiumDestination = "/onboarding";

        // 1) Confirm with Stripe (cookie not required)
        const res = await fetch(`/api/stripe/confirm?session_id=${sessionId}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = await res.json();

        if (res.status === 401) {
          setMsg("Almost done. Please confirm your login...");
          router.replace(`/login?next=${encodeURIComponent(premiumDestination)}`);
          return;
        }

        if (!json?.ok) {
          setMsg("We couldn’t verify your subscription. Taking you back…");
          setTimeout(() => router.replace("/upgrade"), 1000);
          return;
        }

        const premium: boolean = !!json.premium;

        // 2) Quick cookie check: can we read tier for *current* session?
        //    If this 401s, the cookie isn't available yet → go to login with next=/dashboard.
        const tierRes = await fetch("/api/users/tier", { cache: "no-store" });
        if (tierRes.status === 401) {
          setMsg("Almost done. Please confirm login...");
          router.replace(`/login?next=${encodeURIComponent(premiumDestination)}`);
          return;
        }

        // 3) If the webhook is still settling, poll only the signed-in account.
        if (!premium) {
          setMsg("Finalizing your Premium access…");
          const deadline = Date.now() + 6000; // up to 6s
          let isPremium = false;

          while (Date.now() < deadline) {
            // use explicit userId so we don't depend on cookie yet
            const r = await fetch("/api/users/tier", { cache: "no-store" });
            const j = await r.json().catch(() => null);
            if (j?.tier === "premium") {
              isPremium = true;
              break;
            }
            await new Promise((s) => setTimeout(s, 500));
          }

          if (isPremium) {
            setMsg("Welcome to Premium! Opening your first-week setup...");
            setTimeout(() => router.replace(premiumDestination), 600);
            return;
          }
        }

        // 4) Default success route
        setMsg("Welcome to Premium! Opening your first-week setup...");
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
