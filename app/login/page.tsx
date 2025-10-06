"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleStarted, setGoogleStarted] = useState(false);

  // --- Magic Link login handler ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setMessage("❌ " + error.message);
    } else {
      setMessage("✅ Check your email for a magic link to log in.");
    }
    setLoading(false);
  };

  // --- Google OAuth login handler ---
  const handleGoogleLogin = async () => {
    setGoogleStarted(true);
    setMessage("Redirecting to Google...");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      console.error("Google sign-in error:", error.message);
      setMessage("Error with Google sign-in: " + error.message);
      setGoogleStarted(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F8F5FB] via-white to-[#EAFBF8] overflow-hidden">
      {/* Floating accent blobs */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-[#D9C2F0] opacity-30 blur-3xl rounded-full animate-[float_10s_ease-in-out_infinite]" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#A8F0E4] opacity-40 blur-3xl rounded-full animate-[float_12s_ease-in-out_infinite]" />

      <div className="relative z-10 w-full max-w-md bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg p-8 border border-gray-100">
        <h1 className="text-4xl font-extrabold text-center bg-gradient-to-r from-[#041B2D] via-[#06C1A0] to-purple-600 bg-clip-text text-transparent mb-2">
          LVE360
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Longevity • Vitality • Energy
        </p>

        {!googleStarted && (
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#06C1A0] focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-2 rounded-lg text-white font-semibold transition ${
                  loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#06C1A0] hover:bg-[#04997E]"
                }`}
              >
                {loading ? "Sending Magic Link..." : "Send Magic Link"}
              </button>
            </form>

            <div className="flex items-center my-6">
              <div className="flex-grow h-px bg-gray-300"></div>
              <span className="px-2 text-sm text-gray-500">or</span>
              <div className="flex-grow h-px bg-gray-300"></div>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition"
            >
              <img src="/icons/google.svg" alt="Google" className="w-5 h-5" />
              <span className="text-gray-700 font-medium">
                Continue with Google
              </span>
            </button>
          </>
        )}

        {/* Message */}
        {message && (
          <p className="mt-6 text-sm text-center text-gray-700">{message}</p>
        )}
      </div>
    </div>
  );
}
