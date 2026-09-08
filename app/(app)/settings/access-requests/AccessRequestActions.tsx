"use client";

import { useState } from "react";

type RequestStatus = "submitted" | "reviewing" | "declined" | "approved" | "withdrawn";
type InvitationSummary = {
  id: string;
  status: "issued" | "accepted" | "revoked";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export function AccessRequestActions({
  id,
  initialStatus,
  initialNotes,
  approvalEnabled,
  initialInvitation,
}: {
  id: string;
  initialStatus: RequestStatus;
  initialNotes: string | null;
  approvalEnabled: boolean;
  initialInvitation: InvitationSummary | null;
}) {
  const [status, setStatus] = useState<RequestStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [invitation, setInvitation] = useState(initialInvitation);
  const [invitationUrl, setInvitationUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const activeInvitation = invitation?.status === "issued" && new Date(invitation.expiresAt).getTime() > Date.now();
  const canTriage = status !== "approved";

  async function save(nextStatus: "submitted" | "reviewing" | "declined" | "withdrawn") {
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/access-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus, notes }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!response.ok) return setMessage(result.error ?? "Review could not be saved.");
    setStatus(nextStatus);
    setMessage("Saved.");
  }

  async function issue() {
    if (activeInvitation && !window.confirm("Replace the active link? The previous link will stop working.")) return;
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/access-requests/${id}/invitation`, { method: "POST" });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      invitation?: { id: string; expiresAt: string; url: string };
    };
    setSaving(false);
    if (!response.ok || !result.invitation) return setMessage(result.error ?? "Invitation could not be issued.");
    setStatus("approved");
    setInvitation({ id: result.invitation.id, status: "issued", expiresAt: result.invitation.expiresAt, acceptedAt: null, revokedAt: null });
    setInvitationUrl(result.invitation.url);
    setMessage("Invitation issued. Copy this link now; the raw token is never stored and cannot be shown again.");
  }

  async function revoke() {
    if (!invitation || !window.confirm("Revoke this invitation link?")) return;
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/invitations/${invitation.id}`, { method: "DELETE" });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!response.ok) return setMessage(result.error ?? "Invitation could not be revoked.");
    setStatus("reviewing");
    setInvitation({ ...invitation, status: "revoked", revokedAt: new Date().toISOString() });
    setInvitationUrl("");
    setMessage("Invitation revoked.");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(invitationUrl);
    setMessage("Invitation link copied.");
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={`notes-${id}`}>Founder notes</label>
      <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" id={`notes-${id}`} maxLength={2000} onChange={(event) => setNotes(event.target.value)} rows={2} value={notes} />

      {canTriage ? (
        <div className="flex flex-wrap gap-2">
          <button className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={saving || status === "submitted"} onClick={() => save("submitted")} type="button">Submitted</button>
          <button className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950 disabled:opacity-50" disabled={saving || status === "reviewing"} onClick={() => save("reviewing")} type="button">Reviewing</button>
          <button className="rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-red-950 disabled:opacity-50" disabled={saving || status === "declined"} onClick={() => save("declined")} type="button">Decline</button>
          <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50" disabled={saving || status === "withdrawn"} onClick={() => save("withdrawn")} type="button">Withdrawn</button>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        {invitation ? <p>Invitation: <strong>{activeInvitation ? "active" : invitation.status}</strong> · expires {new Date(invitation.expiresAt).toLocaleString()}</p> : <p>No invitation issued.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {invitation?.status !== "accepted" ? (
            <button className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={saving || !approvalEnabled || status === "declined"} onClick={issue} title={approvalEnabled ? "Issue a seven-day single-use link" : "Founder GO gate is locked"} type="button">
              {activeInvitation ? "Replace invitation link" : "Approve & issue link"}
            </button>
          ) : null}
          {activeInvitation ? <button className="rounded-lg border border-red-300 bg-white px-3 py-2 font-semibold text-red-800 disabled:opacity-50" disabled={saving} onClick={revoke} type="button">Revoke link</button> : null}
        </div>
      </div>

      {invitationUrl ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <label className="text-xs font-semibold text-emerald-950" htmlFor={`invite-${id}`}>One-time invitation URL</label>
          <div className="mt-2 flex gap-2">
            <input className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs" id={`invite-${id}`} readOnly value={invitationUrl} />
            <button className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white" onClick={copyLink} type="button">Copy</button>
          </div>
        </div>
      ) : null}
      {message ? <p className="text-xs text-slate-600" role="status">{message}</p> : null}
    </div>
  );
}
