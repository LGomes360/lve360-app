"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  // --- Magic Link login handler ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setMessage("Error sending magic link: " + error.message);
    } else {
      setMessage("✅ Check your email for a magic link to log in.");
    }
  };

  // --- Google OAuth login handler (with redirect) ---
  const handleGoogleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (error) {
      console.error("Google sign-in error:", error.message);
      setMessage("Error with Google sign-in: " + error.message);
    } else {
      // Immediately show a message or redirect
      setMessage("Redirecting to dashboard...");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg">
        <h1 className="text-2xl font-bold text-purple-700 mb-4">
          Log in to LVE360
        </h1>
        <p className="text-gray-600 mb-6">
          Choose your preferred way to sign in below.
        </p>

        {/* Email / Magic Link form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full border border-purple-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
          <button
            type="submit"
            className="w-full bg-purple-600 text-white font-semibold py-2 rounded-lg hover:bg-purple-700 transition"
          >
            Send Magic Link
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-6">
          <div className="flex-grow h-px bg-gray-300"></div>
          <span className="px-2 text-sm text-gray-500">or</span>
          <div className="flex-grow h-px bg-gray-300"></div>
        </div>

        {/* Google login */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition"
        >
          <img
            src="/icons/google.svg"
            alt="Google"
            className="w-5 h-5"
          />
          <span className="text-gray-700 font-medium">Continue with Google</span>
        </button>

        {/* Status message */}
        {message && (
          <p className="mt-4 text-sm text-gray-700 text-center">{message}</p>
        )}
      </div>
    </div>
  );
}
