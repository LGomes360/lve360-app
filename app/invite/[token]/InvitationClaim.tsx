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
      setMessage("Check the invited inbox for a secure sign-in link. The invitation is used only after that link confirms the same email address.");
    } catch {
      setState("error");
      setMessage("The secure login email could not be sent. Please try again.");
    }
  }

  return (
    <div className="mt-8">
      <button className="w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60" disabled={state === "sending" || state === "sent"} onClick={claim} type="button">
        {state === "sending" ? "Sending secure link…" : state === "sent" ? "Secure link sent" : "Continue with the invited email"}
      </button>
      {message ? <p className={`mt-4 text-sm leading-6 ${state === "error" ? "text-red-700" : "text-emerald-800"}`} role="status">{message}</p> : null}
    </div>
  );
}

