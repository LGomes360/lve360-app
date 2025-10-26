"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Make this page fully dynamic and skip prerender/export
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = false; // ✅ avoid the "[object Object]" error

function SuccessInner() {
  const router = useRouter();
  const sp = useSearchParams();            // must be inside Suspense
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
        const res = await fetch(`/api/stripe/confirm?session_id=${sessionId}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = await res.json();
        if (json?.ok && json?.premium) {
          setMsg("Welcome to Premium! Redirecting…");
          setTimeout(() => router.replace("/dashboard"), 800);
        } else {
          setMsg("Still verifying your subscription…");
          setTimeout(() => router.replace("/upgrade"), 1200);
        }
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

export default function UpgradeSuccess() {
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
      <SuccessInner />
    </Suspense>
  );
}
