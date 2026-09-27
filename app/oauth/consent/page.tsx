import Link from "next/link";
import { LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { redirect } from "next/navigation";

import { isFounderUser } from "@/lib/productMode";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const authorizationId = (await searchParams).authorization_id?.trim();
  if (!authorizationId || authorizationId.length > 500) {
    return <ConsentError message="This authorization request is missing or invalid." />;
  }

  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const signedInEmail = user.email?.trim().toLowerCase() || "This signed-in LVE360 account";
  if (!isFounderUser(user.id)) {
    return (
      <ConsentError
        message="This private health-context pilot is currently limited to the LVE360 founder account."
        authorizationId={authorizationId}
        signedInEmail={signedInEmail}
      />
    );
  }

  const { data: authorization, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !authorization) {
    return <ConsentError message="This authorization request is invalid or has expired. Start the connection again in ChatGPT." />;
  }
  if (!("authorization_id" in authorization)) redirect(authorization.redirect_url);

  const scopes = authorization.scope.split(" ").map((item) => item.trim()).filter(Boolean);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAFBF8] via-white to-[#F8F5FB] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-9">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#EAFBF8] p-2.5 text-[#047F6D]"><ShieldCheck className="h-6 w-6" aria-hidden="true" /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#047F6D]">Private founder pilot</p>
            <h1 className="mt-1 text-2xl font-black text-[#041B2D]">Allow {authorization.client.name || "ChatGPT"} to connect to LVE360?</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This connection can check whether your founder account is linked and save one summary only after you approve the exact content in ChatGPT.
            </p>
          </div>
        </div>

        <AccountIdentity email={signedInEmail} authorizationId={authorizationId} />

        <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5" aria-labelledby="connection-can-do">
          <h2 id="connection-can-do" className="font-bold text-[#041B2D]">What this connection can do</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            <li>Save your approved summaries for sleep, exercise, diet and weight, overall feeling, and lab balance.</li>
            <li>Save the covered date range, missing context, and one proposed focus.</li>
            <li>Report whether a handoff was saved, without returning the health summary in tool logs.</li>
          </ul>
        </section>

        <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-labelledby="connection-cannot-do">
          <h2 id="connection-cannot-do" className="font-bold text-amber-950">What stays out of LVE360</h2>
          <p className="mt-2 text-sm leading-6 text-amber-950">
            Raw Apple Health samples, medical records, workout routes, diagnoses, medication changes, and mental-health states inferred without your own description are not accepted.
          </p>
        </section>

        {scopes.length > 0 ? (
          <div className="mt-4 text-xs leading-5 text-slate-500">
            Requested permissions: {scopes.join(", ")}. Return destination: {authorization.redirect_uri}
          </div>
        ) : null}

        <form action="/api/oauth/decision" method="POST" className="mt-7 flex flex-col gap-3 sm:flex-row">
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <button type="submit" name="decision" value="approve" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#047F6D] px-5 py-3 font-bold text-white hover:bg-[#036c5d]">
            Approve connection
          </button>
          <button type="submit" name="decision" value="deny" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold text-[#041B2D] hover:bg-slate-50">
            Deny
          </button>
        </form>

        <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-500">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          You can remove any saved handoff in Settings. OAuth access can also be revoked from your Supabase-backed account controls.
        </p>
      </div>
    </main>
  );
}

function AccountIdentity({
  email,
  authorizationId,
}: {
  email: string;
  authorizationId: string;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-[#9EDFD5] bg-[#F2FCFA] p-5" aria-labelledby="connecting-account">
      <div className="flex items-start gap-3">
        <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-[#047F6D]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="connecting-account" className="text-sm font-bold text-[#041B2D]">Connecting this LVE360 account</h2>
          <p className="mt-1 break-all text-sm font-semibold text-[#047F6D]">{email}</p>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            Your ChatGPT and LVE360 email addresses do not need to match. Health context is saved only to the LVE360 account shown here.
          </p>
          <form action="/api/oauth/switch-account" method="POST" className="mt-3">
            <input type="hidden" name="authorization_id" value={authorizationId} />
            <button type="submit" className="min-h-10 rounded-lg border border-[#9EDFD5] bg-white px-3 py-2 text-sm font-bold text-[#047F6D] hover:bg-[#EAFBF8]">
              Use a different LVE360 account
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function ConsentError({
  message,
  authorizationId,
  signedInEmail,
}: {
  message: string;
  authorizationId?: string;
  signedInEmail?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-lg">
        <h1 className="text-xl font-black text-[#041B2D]">Connection unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        {authorizationId && signedInEmail ? (
          <div className="text-left">
            <AccountIdentity email={signedInEmail} authorizationId={authorizationId} />
          </div>
        ) : null}
        <Link href="/settings#health-context" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#047F6D] px-4 py-2.5 font-bold text-white">Return to Settings</Link>
      </div>
    </main>
  );
}
