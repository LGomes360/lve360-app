"use client";

import { FormEvent, ReactNode, useState } from "react";

import { INVITATION_INTERESTS } from "@/src/lib/invitationRequest";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-900" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200";

export function InvitationRequestForm() {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setState("submitting");
    setMessage("");
    const form = new FormData(formElement);

    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          email: form.get("email"),
          organizingHelp: form.get("organizingHelp"),
          interests: form.getAll("interests"),
          requestReason: form.get("requestReason"),
          referralSource: form.get("referralSource"),
          referralCode: form.get("referralCode"),
          website: form.get("website"),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string; error?: string };

      if (!response.ok) {
        setState("error");
        setMessage(result.error ?? "Your request could not be sent. Please try again.");
        return;
      }

      setState("success");
      setMessage(result.message ?? "Thanks. Your request is on the list for founder review.");
      formElement.reset();
    } catch {
      setState("error");
      setMessage("Your request could not be sent. Please try again.");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6" role="status">
        <h2 className="text-xl font-semibold text-emerald-950">You’re on the list.</h2>
        <p className="mt-2 text-sm leading-6 text-emerald-900">{message}</p>
        <p className="mt-3 text-sm text-emerald-900">Submitting a request does not create an account or guarantee an invitation.</p>
      </div>
    );
  }

  return (
    <form className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName">
          <input className={inputClass} id="firstName" name="firstName" maxLength={80} required autoComplete="given-name" />
        </Field>
        <Field label="Email" htmlFor="email">
          <input className={inputClass} id="email" name="email" type="email" maxLength={320} required autoComplete="email" />
        </Field>
      </div>

      <Field label="What would you like help organizing?" htmlFor="organizingHelp">
        <textarea className={inputClass} id="organizingHelp" name="organizingHelp" rows={3} maxLength={500} required />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium text-slate-900">What are you interested in?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {INVITATION_INTERESTS.map((interest) => (
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800" key={interest}>
              <input className="h-4 w-4 rounded border-slate-300 text-sky-600" name="interests" type="checkbox" value={interest} />
              {interest}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Why are you interested? (optional)" htmlFor="requestReason">
        <textarea className={inputClass} id="requestReason" name="requestReason" rows={3} maxLength={1000} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="How did you hear about LVE360? (optional)" htmlFor="referralSource">
          <input className={inputClass} id="referralSource" name="referralSource" maxLength={120} />
        </Field>
        <Field label="Invitation or referral code (optional)" htmlFor="referralCode">
          <input className={inputClass} id="referralCode" name="referralCode" maxLength={120} />
        </Field>
      </div>

      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        Please do not include diagnoses, medication details, lab results, or other private health information.
      </p>

      {state === "error" ? <p className="text-sm text-red-700" role="alert">{message}</p> : null}
      <button className="w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60" disabled={state === "submitting"} type="submit">
        {state === "submitting" ? "Sending request…" : "Request an invitation"}
      </button>
    </form>
  );
}
