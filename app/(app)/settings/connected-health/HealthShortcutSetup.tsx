"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clipboard, Loader2, Smartphone, Trash2 } from "lucide-react";

type KeyStatus = {
  ok: boolean;
  active?: boolean;
  requested_data_types?: string[];
  expires_at?: string | null;
  last_used_at?: string | null;
};

const SYNC_PATH = "/api/health/apple/shortcuts/sync";

export default function HealthShortcutSetup() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<"url" | "key" | null>(null);
  const [syncUrl, setSyncUrl] = useState(SYNC_PATH);

  useEffect(() => {
    setSyncUrl(`${window.location.origin}${SYNC_PATH}`);
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
      setMessage({ tone: "success", text: "Connection key created. Copy it now. For your privacy, it will not appear again after you leave this page." });
    } catch {
      setMessage({ tone: "error", text: "We could not create a connection key. No Health data was shared." });
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
      setMessage({ tone: "success", text: "Disconnected. The connection key no longer works and imported summaries were removed." });
    } catch {
      setMessage({ tone: "error", text: "We could not confirm complete removal. Please retry before assuming the data is gone." });
      void loadStatus();
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, item: "url" | "key") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(item);
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
              Use the Shortcuts app already on your iPhone. No LVE360 app or Apple developer membership is needed.
              This first pilot shares only a daily step total, never raw samples, routes, or clinical records.
            </p>
          </div>
        </div>
      </header>

      {message && (
        <p role="status" className={`rounded-xl border p-4 text-sm ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {message.text}
        </p>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="shortcut-connection-title">
        <h2 id="shortcut-connection-title" className="text-xl font-black text-[#041B2D]">1. Create a private connection key</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The key can only send the Health categories you choose. It cannot access your account or change your plan.
          A new key replaces the old one and expires after 90 days. Keep it private and do not share your Shortcut.
        </p>
        {loading ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Checking connection</p>
        ) : (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-semibold text-[#041B2D]">
              {status?.active ? "Connection key active" : "No active connection key"}
              {status?.active && status.expires_at ? ` until ${new Date(status.expires_at).toLocaleDateString()}` : ""}
            </p>
            {status?.last_used_at ? <p className="text-sm text-slate-600">Last received data {new Date(status.last_used_at).toLocaleString()}.</p> : null}
            <button type="button" onClick={() => void createKey()} disabled={busy} className="rounded-xl bg-[#047F6D] px-4 py-2.5 font-semibold text-white disabled:opacity-50">
              {status?.active ? "Replace connection key" : "Create connection key"}
            </button>
          </div>
        )}
        {key && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">Copy this authorization value into your Shortcut. It appears only now.</p>
            <code className="mt-2 block break-all rounded-lg bg-white p-3 text-xs text-slate-900">Bearer {key}</code>
            <button type="button" onClick={() => void copy(`Bearer ${key}`, "key")} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950">
              {copied === "key" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />} Copy authorization value
            </button>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="shortcut-steps-title">
        <h2 id="shortcut-steps-title" className="text-xl font-black text-[#041B2D]">2. Build and run the Shortcut on your iPhone</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-700">
          <li>In Shortcuts, create a new shortcut. Add <strong>Find Health Samples</strong> for <strong>Steps</strong> from <strong>Today</strong>, grouped by day. Take the first result and get its <strong>Value</strong>.</li>
          <li>Add <strong>Get Contents of URL</strong>. Paste the URL below, select <strong>POST</strong>, and set its body to <strong>JSON</strong>.</li>
          <li>Add JSON fields <code>type</code> = <code>steps</code>, <code>unit</code> = <code>count</code>, and <code>value</code> = the Health sample value. Add an <code>Authorization</code> header with the copied value above.</li>
          <li>Add <strong>Show Result</strong> after the web request, then run the Shortcut and allow it to read Steps. A successful response says <code>ok: true</code>. Refresh Today in LVE360 to see the imported total.</li>
        </ol>
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Sync URL</p>
          <code className="mt-2 block break-all text-xs text-[#041B2D]">{syncUrl}</code>
          <button type="button" onClick={() => void copy(syncUrl, "url")} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-[#041B2D]">
            {copied === "url" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />} Copy URL
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-amber-900">
          Compare the first result with the Health app before relying on it. If your iPhone and watch both recorded steps,
          Shortcuts may count overlapping samples differently. Leave automation off until the numbers match your expectations.
        </p>
      </section>

      <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="shortcut-remove-title">
        <h2 id="shortcut-remove-title" className="text-lg font-black text-[#041B2D]">Disconnect and remove imported data</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">This disables the key and deletes Apple Health summaries imported into LVE360. It does not delete anything from Apple Health on your iPhone.</p>
        <button type="button" onClick={() => void disconnect()} disabled={busy || loading} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-300 px-4 py-2.5 font-semibold text-rose-700 disabled:opacity-50">
          <Trash2 className="h-4 w-4" /> Disconnect and delete imports
        </button>
      </section>
    </div>
  );
}
