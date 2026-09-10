"use client";

import { useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function InvitationClaim({ email, token }: { email: string; token: string }) {
  const supabase = createClientComponentClient();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", "/today");
    url.searchParams.set("invite", token);
    return url.toString();
  }, [token]);

  async function google() {
    setState("sending");
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl, queryParams: { prompt: "select_account", login_hint: email } },
      });
      if (error) throw error;
    } catch {
      setState("error");
      setMessage("Google sign-in could not start. Please try again.");
    }
  }

  async function claim() {
    setState("sending");
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setState("sent");
      setMessage("Check the invited inbox for a secure sign-in link. You can open the newest link in any browser. The invitation is used only after that link confirms the same email address.");
    } catch {
      setState("error");
      setMessage("The secure login email could not be sent. Please try again.");
    }
  }

  return (
    <div className="mt-8">
      <button type="button" onClick={google} disabled={state === "sending"} className="mb-4 w-full rounded-xl border border-slate-300 px-5 py-3 font-semibold disabled:opacity-60">Continue with Google using the invited email</button>
      <p className="mb-4 text-sm text-slate-600">For email sign-in, open the newest link in any browser. Each link works once and expires shortly.</p>
      <button className="w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60" disabled={state === "sending" || state === "sent"} onClick={claim} type="button">
        {state === "sending" ? "Sending secure link…" : state === "sent" ? "Secure link sent" : "Continue with the invited email"}
      </button>
      {message ? <p className={`mt-4 text-sm leading-6 ${state === "error" ? "text-red-700" : "text-emerald-800"}`} role="status">{message}</p> : null}
    </div>
  );
}

