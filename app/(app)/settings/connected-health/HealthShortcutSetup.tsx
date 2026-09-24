"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clipboard, ExternalLink, Loader2, Smartphone, Trash2 } from "lucide-react";

type KeyStatus = {
  ok: boolean;
  active?: boolean;
  requested_data_types?: string[];
  expires_at?: string | null;
  last_used_at?: string | null;
};

export default function HealthShortcutSetup({ sharedShortcutUrl }: { sharedShortcutUrl: string | null }) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const response = await fetch("/api/health/apple/shortcuts/key", { cache: "no-store" });
      const body = await response.json() as KeyStatus;
      if (!response.ok || !body.ok) throw new Error("status_unavailable");
      setStatus(body);
    } catch {
      setMessage({ tone: "error", text: "Connection status is unavailable. Please try again later." });
    } finally {
      setLoading(false);
    }
  }

  async function createKey() {
    setBusy(true);
    setMessage(null);
    setCopied(false);
    try {
      const response = await fetch("/api/health/apple/shortcuts/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requested_data_types: ["steps"] }),
      });
      const body = await response.json() as KeyStatus & { token?: string };
      if (!response.ok || !body.ok || !body.token) throw new Error("key_unavailable");
      setKey(body.token);
      setStatus({
        ok: true,
        active: true,
        requested_data_types: body.requested_data_types,
        expires_at: body.expires_at,
        last_used_at: null,
      });
      setMessage({ tone: "success", text: "Private connection created. Copy the value below before leaving this page." });
    } catch {
      setMessage({ tone: "error", text: "We could not create a private connection. No Health data was shared." });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect your iPhone Shortcut and permanently remove its imported Apple Health summaries from LVE360?")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/health/apple/shortcuts/key", { method: "DELETE" });
      const body = await response.json() as { ok?: boolean };
      if (!response.ok || !body.ok) throw new Error("disconnect_unavailable");
      setKey(null);
      setStatus({ ok: true, active: false });
      setMessage({ tone: "success", text: "Disconnected. The connection no longer works and imported summaries were removed." });
    } catch {
      setMessage({ tone: "error", text: "We could not confirm complete removal. Please retry before assuming the data is gone." });
      void loadStatus();
    } finally {
      setBusy(false);
    }
  }

  async function copyKey(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setMessage({ tone: "error", text: "Copy failed. Select and copy the text manually." });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <Link href="/settings" className="inline-flex items-center gap-2 text-sm font-semibold text-[#047F6D] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </Link>

      <header className="rounded-3xl border border-[#BCE3DA] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-[#EAFBF8] p-3 text-[#047F6D]"><Smartphone className="h-6 w-6" /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#047F6D]">iPhone pilot</p>
            <h1 className="mt-1 text-3xl font-black text-[#041B2D]">Share steps from Apple Health</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              A finished LVE360 Shortcut will send only your daily step total. It will never send raw samples,
              routes, or clinical records. No LVE360 iPhone app or Apple developer membership is required.
            </p>
          </div>
        </div>
      </header>

      {message && (
        <p role="status" className={`rounded-xl border p-4 text-sm ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {message.text}
        </p>
      )}

      {!sharedShortcutUrl && (
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm sm:p-8" aria-labelledby="shortcut-paused-title">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">Founder pilot</p>
          <h2 id="shortcut-paused-title" className="mt-1 text-xl font-black text-[#041B2D]">The one-tap installer is not ready yet</h2>
          <p className="mt-2 text-sm leading-6 text-amber-950">
            You are not expected to build a web request or edit technical fields in Shortcuts. LVE360 will enable
            this page after the finished Shortcut has been tested on an iPhone and published as a private Apple link.
          </p>
          <p className="mt-3 text-sm font-semibold text-amber-950">There is nothing you need to configure right now.</p>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="shortcut-connection-title">
        <h2 id="shortcut-connection-title" className="text-xl font-black text-[#041B2D]">1. Create your private connection</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This connection can only send the Health categories you choose. It cannot open your account or change your plan.
          A new connection replaces the old one and expires after 90 days.
        </p>
        {loading ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Checking connection</p>
        ) : (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-semibold text-[#041B2D]">
              {status?.active ? "Private connection active" : "No active connection"}
              {status?.active && status.expires_at ? ` until ${new Date(status.expires_at).toLocaleDateString()}` : ""}
            </p>
            {status?.last_used_at ? <p className="text-sm text-slate-600">Last received data {new Date(status.last_used_at).toLocaleString()}.</p> : null}
            {sharedShortcutUrl ? (
              <button type="button" onClick={() => void createKey()} disabled={busy} className="rounded-xl bg-[#047F6D] px-4 py-2.5 font-semibold text-white disabled:opacity-50">
                {status?.active ? "Replace private connection" : "Create private connection"}
              </button>
            ) : (
              <p className="text-sm text-slate-600">Connection creation is paused until the one-tap installer is available.</p>
            )}
          </div>
        )}
        {key && sharedShortcutUrl && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">Copy this private value. Apple will ask for it while adding the Shortcut.</p>
            <code className="mt-2 block break-all rounded-lg bg-white p-3 text-xs text-slate-900">Bearer {key}</code>
            <button type="button" onClick={() => void copyKey(`Bearer ${key}`)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950">
              {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />} {copied ? "Copied" : "Copy private value"}
            </button>
          </div>
        )}
      </section>

      <section className={`rounded-3xl border bg-white p-6 shadow-sm sm:p-8 ${sharedShortcutUrl ? "border-slate-200" : "border-slate-200 opacity-60"}`} aria-labelledby="shortcut-install-title">
        <h2 id="shortcut-install-title" className="text-xl font-black text-[#041B2D]">2. Add the LVE360 Shortcut</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-700">
          <li>Create and copy the private value above.</li>
          <li>Tap <strong>Add LVE360 Shortcut</strong>. When Apple asks for the private value, paste it.</li>
          <li>Run the Shortcut once and allow it to read Steps. Then return to Today to see the imported total.</li>
        </ol>
        {sharedShortcutUrl && key ? (
          <a href={sharedShortcutUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#047F6D] px-4 py-2.5 font-semibold text-white">
            Add LVE360 Shortcut <ExternalLink className="h-4 w-4" />
          </a>
        ) : sharedShortcutUrl ? (
          <button type="button" disabled className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 font-semibold text-slate-500">
            Create the private connection first
          </button>
        ) : (
          <p className="mt-5 text-sm font-semibold text-slate-600">Installer unavailable during founder validation.</p>
        )}
        <p className="mt-4 text-sm leading-6 text-amber-900">
          Compare the first result with the Health app before relying on it. If your iPhone and watch both recorded steps,
          the Shortcut may count overlapping samples differently. Leave automation off until the numbers match.
        </p>
      </section>

      <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="shortcut-remove-title">
        <h2 id="shortcut-remove-title" className="text-lg font-black text-[#041B2D]">Disconnect and remove imported data</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">This disables the connection and deletes Apple Health summaries imported into LVE360. It does not delete anything from Apple Health on your iPhone.</p>
        <button type="button" onClick={() => void disconnect()} disabled={busy || loading || !status?.active} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-300 px-4 py-2.5 font-semibold text-rose-700 disabled:opacity-50">
          <Trash2 className="h-4 w-4" /> Disconnect and delete imports
        </button>
      </section>
    </div>
  );
}
