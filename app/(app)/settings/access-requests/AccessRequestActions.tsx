"use client";

import { useState } from "react";

type Status = "pending" | "waitlisted" | "declined";

export function AccessRequestActions({ id, initialStatus, initialNotes }: { id: string; initialStatus: Status; initialNotes: string | null }) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(nextStatus: Status) {
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/access-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus, notes }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error ?? "Review could not be saved.");
      return;
    }
    setStatus(nextStatus);
    setMessage("Saved.");
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={`notes-${id}`}>Founder notes</label>
      <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" id={`notes-${id}`} maxLength={2000} onChange={(event) => setNotes(event.target.value)} rows={2} value={notes} />
      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={saving || status === "pending"} onClick={() => save("pending")} type="button">Pending</button>
        <button className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950 disabled:opacity-50" disabled={saving || status === "waitlisted"} onClick={() => save("waitlisted")} type="button">Waitlist</button>
        <button className="rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-red-950 disabled:opacity-50" disabled={saving || status === "declined"} onClick={() => save("declined")} type="button">Decline</button>
        <button className="cursor-not-allowed rounded-lg bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-950 opacity-50" disabled title="PR166 secure invitation issuance is not installed yet" type="button">Approve & invite</button>
      </div>
      {message ? <p className="text-xs text-slate-600" role="status">{message}</p> : null}
    </div>
  );
}
