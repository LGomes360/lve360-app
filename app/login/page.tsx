"use client";

import { useState, useMemo, Suspense } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

import { useProductMode } from "@/components/ProductModeProvider";
import { trackProductEvent } from "@/lib/productAnalyticsClient";

// --- moved your existing logic into an inner component that can be wrapped in <Suspense> ---
function LoginInner() {
  const supabase = createClientComponentClient();
  const searchParams = useSearchParams();
  const { accessMode, publicSignupEnabled } = useProductMode();
  const inviteOnly = accessMode === "invite_only";

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  // Determine where to send users after /auth/callback
  const nextPath = useMemo(() => {
    const n = searchParams?.get("next");
    // only allow same-site, safe paths
    if (n && n.startsWith("/")) return n;
    return "/today";
  }, [searchParams]);

  const callbackUrl = useMemo(() => {
    // Auth must return to the host that initiated it. This keeps Vercel Preview
    // PKCE cookies on the same origin while preserving app.lve360.com in production.
    const appUrl = typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "";
    const u = new URL("/auth/callback", appUrl || "http://localhost:3000");
    u.searchParams.set("next", nextPath);
    return u.toString();
  }, [nextPath]);

  // --- Email Magic Link ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    try {
      trackProductEvent({ event_name: "login_started", source: "login" });
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl,
          shouldCreateUser: publicSignupEnabled,
        },
      });

      if (error) setMessage("❌ " + error.message);
      else setMessage("✅ Check your email for a secure login link. You can open the newest link in any browser.");
    } catch (err: any) {
      setMessage("❌ " + (err?.message ?? "Unexpected error"));
    }
  };

  // --- Google Sign-In ---
  const handleGoogleLogin = async () => {
    setMessage("");
    try {
      trackProductEvent({ event_name: "login_started", source: "login" });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) setMessage("❌ " + error.message);
    } catch (err: any) {
      setMessage("❌ " + (err?.message ?? "Unexpected error"));
    }
  };

  return (
    <motion.main
      className="relative isolate overflow-hidden min-h-screen flex items-center justify-center bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* Floating blobs */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full
                   bg-[#A8F0E4] opacity-40 blur-3xl animate-[float_8s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-[20rem] -right-24 h-[28rem] w-[28rem] rounded-full
                   bg-[#D9C2F0] opacity-30 blur-3xl animate-[float_10s_ease-in-out_infinite]"
        aria-hidden
      />

      {/* Card */}
      <motion.div
        className="relative z-10 max-w-md w-full bg-white/95 backdrop-blur rounded-2xl shadow-2xl ring-1 ring-purple-100 p-8 text-center"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-[#041B2D] via-[#06C1A0] to-purple-600 bg-clip-text text-transparent mb-3">
          Log in to LVE360
        </h1>
        <p className="text-gray-600 mb-6">
          {inviteOnly
            ? "Welcome back. LVE360 is currently a private membership."
            : "Your personalized path to Longevity, Vitality, and Energy."}
        </p>

        {/* Google button */}
          <>
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] py-2.5 font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              <Image src="/icons/google.svg" alt="" width={20} height={20} className="h-5 w-5" />
              Continue with Google
            </button>

            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">or</span>
              </div>
            </div>
          </>

        {/* Email magic link form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
          <button
            type="submit"
            className="w-full bg-purple-600 text-white font-semibold py-2.5 rounded-lg hover:bg-purple-700 transition"
          >
            Send secure login link
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-gray-700 animate-fade-in">{message}</p>
        )}

        <p className="mt-6 text-xs text-gray-400">🔒 We never store your password.</p>
        {inviteOnly ? (
          <div className="mt-6 border-t border-slate-200 pt-5 text-sm text-slate-600">
            <p>
              Don&apos;t have access?{" "}
              <Link href="/request-invitation" className="font-semibold text-[#087F72] hover:text-[#06695F]">Request an invitation</Link>.
            </p>
            <p className="mt-2">
              New to LVE360?{" "}
              <Link href="/#blueprint" className="font-semibold text-[#087F72] hover:text-[#06695F]">Try the free Blueprint</Link>.
            </p>
          </div>
        ) : null}
      </motion.div>
    </motion.main>
  );
}

export default function LoginPage() {
  // Minimal change: wrap the hook-using component so Next is happy during prerender/hydration
  return (
    <Suspense fallback={<div className="p-6 text-gray-600">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}

// Prevent static export/prerender from evaluating client hooks too early
export const dynamic = "force-dynamic";
