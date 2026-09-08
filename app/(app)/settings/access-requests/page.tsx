import { redirect } from "next/navigation";

import { getProductMode, isFounderUser } from "@/src/lib/productMode";
import { getSupabaseAdmin } from "@/src/lib/supabaseAdmin";
import { supabaseServer } from "@/src/lib/supabase";

import { AccessRequestActions } from "./AccessRequestActions";

type InvitationRow = {
  id: string;
  status: "issued" | "accepted" | "revoked";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

type RequestRow = {
  id: string;
  email: string;
  first_name: string;
  organizing_help: string;
  interests: string[];
  request_reason: string | null;
  referral_source: string | null;
  referral_code: string | null;
  status: "pending" | "waitlisted" | "declined" | "approved" | "revoked";
  founder_notes: string | null;
  created_at: string;
  invitations: InvitationRow[] | InvitationRow | null;
};

export default async function AccessRequestsPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isFounderUser(user.id)) redirect("/dashboard");

  const mode = getProductMode();
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("access_requests")
    .select("id,email,first_name,organizing_help,interests,request_reason,referral_source,referral_code,status,founder_notes,created_at,invitations(id,status,expires_at,accepted_at,revoked_at)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Unable to load access requests: ${error.message}`);
  const requests = (data ?? []) as RequestRow[];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Founder only</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Invitation requests</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Review the private-membership queue, issue seven-day single-use links, and revoke unaccepted links. Raw tokens are shown only once.</p>
        <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${mode.invitationsOperationallyUnlocked ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>
          {mode.invitationsOperationallyUnlocked ? "GO gate open: issuance enabled" : "GO gate locked: issuance disabled"}
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">No invitation requests yet.</div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const invitation = Array.isArray(request.invitations)
              ? request.invitations[0] ?? null
              : request.invitations;
            return (
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">{request.first_name}</h2>
                    <a className="text-sm text-sky-700 underline underline-offset-4" href={`mailto:${request.email}`}>{request.email}</a>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold uppercase tracking-wide text-slate-700">{request.status}</span>
                    <div className="mt-2">{new Date(request.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="font-semibold text-slate-900">Wants help organizing</dt><dd className="mt-1 whitespace-pre-wrap text-slate-600">{request.organizing_help}</dd></div>
                  <div><dt className="font-semibold text-slate-900">Interests</dt><dd className="mt-1 text-slate-600">{request.interests.length ? request.interests.join(", ") : "Not specified"}</dd></div>
                  {request.request_reason ? <div><dt className="font-semibold text-slate-900">Why interested</dt><dd className="mt-1 whitespace-pre-wrap text-slate-600">{request.request_reason}</dd></div> : null}
                  {request.referral_source || request.referral_code ? <div><dt className="font-semibold text-slate-900">Source / code</dt><dd className="mt-1 text-slate-600">{[request.referral_source, request.referral_code].filter(Boolean).join(" · ")}</dd></div> : null}
                </dl>
                <AccessRequestActions
                  approvalEnabled={mode.invitationsOperationallyUnlocked}
                  id={request.id}
                  initialInvitation={invitation ? { id: invitation.id, status: invitation.status, expiresAt: invitation.expires_at, acceptedAt: invitation.accepted_at, revokedAt: invitation.revoked_at } : null}
                  initialNotes={request.founder_notes}
                  initialStatus={request.status}
                />
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
