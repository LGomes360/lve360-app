"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { motion } from "framer-motion";

export default function LoginPage() {
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  // --- Email Magic Link ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) setMessage("❌ " + error.message);
    else setMessage("✅ Check your email for a secure login link!");
  };

  // --- Google Sign-In ---
  const handleGoogleLogin = async () => {
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) setMessage("❌ " + error.message);
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
          Your personalized path to Longevity, Vitality, and Energy.
        </p>

        {/* Google button */}
        <button
          onClick={handleGoogleLogin}
          className="w-full bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] text-white font-semibold py-2.5 rounded-lg shadow-md hover:shadow-lg transition mb-5 flex items-center justify-center gap-2"
        >
          <img
            src="/icons/google.svg"
            alt="Google"
            className="h-5 w-5"
          />
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
            Send Magic Link
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-gray-700 animate-fade-in">{message}</p>
        )}

        <p className="mt-6 text-xs text-gray-400">
          🔒 We never store your password.
        </p>
      </motion.div>
    </motion.main>
  );
}
