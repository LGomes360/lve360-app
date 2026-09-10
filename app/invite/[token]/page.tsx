import Link from "next/link";

import { InvitationClaim } from "./InvitationClaim";
import { hashInvitationToken, isInvitationToken, maskInvitationEmail } from "@/src/lib/invitationTokens";
import { getProductMode } from "@/src/lib/productMode";
import { getSupabaseAdmin } from "@/src/lib/supabaseAdmin";

type InvitationRow = {
  email: string;
  status: "issued" | "accepted" | "revoked";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function Unavailable({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-20 text-slate-950">
      <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-bold">This invitation isn’t available.</h1>
        <p className="mt-4 leading-7 text-slate-600">{message}</p>
        <Link className="mt-7 inline-block font-semibold text-sky-700 underline underline-offset-4" href="/request-invitation">Request an invitation</Link>
      </section>
    </main>
  );
}

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ retry?: string }> }) {
  const { token } = await params;
  const { retry } = await searchParams;
  if (!getProductMode().invitationAcceptanceEnabled) {
    return <Unavailable message="Private invitations have not been opened by the founder." />;
  }
  if (!isInvitationToken(token)) return <Unavailable message="The link is invalid or incomplete." />;

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("invitations")
    .select("email,status,expires_at,accepted_at,revoked_at")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();
  const invitation = data as InvitationRow | null;

  if (!invitation || invitation.status !== "issued" || invitation.accepted_at || invitation.revoked_at) {
    return <Unavailable message="The link is invalid, already used, or has been revoked." />;
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return <Unavailable message="The link has expired. Ask the founder for a fresh invitation." />;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-20 text-slate-950">
      <section className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Private invitation</p>
        <h1 className="mt-3 text-3xl font-bold">Welcome to LVE360.</h1>
        {retry ? <p role="alert" className="mt-4 text-amber-800">That sign-in could not be completed. Your invitation is still available. Try Google below or request a fresh email link and open it in this browser.</p> : null}
        <p className="mt-4 leading-7 text-slate-600">This single-use invitation is for <strong>{maskInvitationEmail(invitation.email)}</strong> and expires {new Date(invitation.expires_at).toLocaleString()}.</p>
        <p className="mt-3 text-sm leading-6 text-slate-500">We’ll email a secure sign-in link to the invited address. Access is granted only after that address is verified.</p>
        <InvitationClaim email={invitation.email} token={token} />
      </section>
    </main>
  );
}
