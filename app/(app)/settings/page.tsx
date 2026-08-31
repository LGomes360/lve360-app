"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Download,
  Loader2,
  LockKeyhole,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";

import type { AccountSettings } from "@/lib/accountSettings";
import ReminderBehaviorCard from "@/components/settings/ReminderBehaviorCard";

type AccountResponse = {
  ok: boolean;
  account?: AccountSettings;
  error?: string;
};

type AccountSaveResponse = {
  ok?: boolean;
  error?: string;
  practice_reminders_reset?: number;
};

const supportEmail = "support@lve360.com";

export default function SettingsPage() {
  const [account, setAccount] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    void loadAccount();
  }, []);

  async function loadAccount() {
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json()) as AccountResponse;
      if (!response.ok || !body.account) throw new Error(body.error ?? "account_unavailable");
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setAccount({
        ...body.account,
        timezone: body.account.timezone === "UTC" && detectedTimezone ? detectedTimezone : body.account.timezone,
      });
    } catch {
      setNotice({ tone: "error", message: "We could not load your settings. Please refresh and try again." });
    } finally {
      setLoading(false);
    }
  }

  async function savePreferences() {
    if (!account) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_name: account.preferred_name,
          weight_unit: account.weight_unit,
          reminder_preference: account.reminder_preference,
          timezone: account.timezone,
          cue_hour: account.cue_hour,
          quiet_start_hour: account.quiet_start_hour,
          quiet_end_hour: account.quiet_end_hour,
        }),
      });
      const body = (await response.json()) as AccountSaveResponse;
      if (!response.ok) throw new Error(body?.error ?? "preferences_unavailable");
      window.localStorage.setItem("lve360_weight_unit", account.weight_unit);
      setNotice({
        tone: "success",
        message: body.practice_reminders_reset
          ? "Your preferences are saved. A weekly reminder that entered quiet hours now uses your account default time."
          : "Your preferences are saved.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error && error.message === "default_reminder_in_quiet_hours"
          ? "Your default reminder time must be outside your quiet hours."
          : "We could not save your preferences. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body?.url) throw new Error(body?.error ?? "portal_unavailable");
      window.location.assign(body.url);
    } catch {
      setNotice({ tone: "error", message: "We could not open billing. Please try again or contact support." });
      setPortalLoading(false);
    }
  }

  async function deleteAccount() {
    if (!account || deleteConfirmation.trim().toLowerCase() !== account.email.toLowerCase()) return;
    setDeleting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "deletion_unavailable");
      window.location.assign("/?account=deleted");
    } catch {
      setNotice({
        tone: "error",
        message: "We could not complete account deletion. Your subscription may have been canceled. Please contact support now.",
      });
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-[#047F6D]" />
        <span className="ml-3 text-sm text-slate-600">Loading settings</span>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-[#041B2D]">Settings are unavailable</h1>
        <p className="mt-2 text-slate-600">Refresh the page or contact support if this continues.</p>
        <button onClick={() => void loadAccount()} className="mt-5 rounded-xl bg-[#047F6D] px-4 py-2 font-semibold text-white">
          Try again
        </button>
      </div>
    );
  }

  const paid = account.tier === "premium" || account.tier === "trial";
  const planName = account.tier === "premium" ? "LVE360 Member" : account.tier === "trial" ? "LVE360 Trial" : "Free";
  const billingLabel =
    account.billing_interval === "annual" ? "Annual billing" :
    account.billing_interval === "monthly" ? "Monthly billing" :
    "No paid billing plan";

  return (
    <div className="mx-auto max-w-4xl space-y-7 pb-12">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#047F6D]">Your account</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#041B2D] sm:text-4xl">Settings</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Keep LVE360 useful for your real life. Choose how we address you, how progress appears, and whether you want helpful email cues.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {notice.tone === "success" && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          {notice.message}
        </div>
      )}

      <Section icon={UserRound} title="Profile and preferences" description="Small choices that make your weekly experience feel like yours.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Preferred name" hint="Used in your dashboard greeting.">
            <input
              value={account.preferred_name}
              maxLength={80}
              onChange={(event) => setAccount({ ...account, preferred_name: event.target.value })}
              placeholder="What should we call you?"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[#041B2D] shadow-sm focus:border-[#047F6D] focus:ring-2 focus:ring-teal-100"
            />
          </Field>
          <Field label="Account email" hint="Your sign-in and report delivery address.">
            <input
              value={account.email}
              readOnly
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-600"
            />
          </Field>
          <Field label="Weight units" hint="Used throughout progress tracking.">
            <select
              value={account.weight_unit}
              onChange={(event) => setAccount({ ...account, weight_unit: event.target.value as "lb" | "kg" })}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[#041B2D] shadow-sm focus:border-[#047F6D] focus:ring-2 focus:ring-teal-100"
            >
              <option value="lb">Pounds (lb)</option>
              <option value="kg">Kilograms (kg)</option>
            </select>
          </Field>
          <Field label="Email reminders" hint="Opt in to practice, recovery, and weekly review cues.">
            <select
              value={account.reminder_preference}
              onChange={(event) => setAccount({ ...account, reminder_preference: event.target.value as "none" | "email" })}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[#041B2D] shadow-sm focus:border-[#047F6D] focus:ring-2 focus:ring-teal-100"
            >
              <option value="email">Send helpful email reminders</option>
              <option value="none">No email reminders</option>
            </select>
          </Field>
          {account.reminder_preference === "email" && (
            <>
              <Field label="My timezone" hint="Reminders follow your local time.">
                <input
                  value={account.timezone}
                  onChange={(event) => setAccount({ ...account, timezone: event.target.value })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[#041B2D] shadow-sm focus:border-[#047F6D] focus:ring-2 focus:ring-teal-100"
                />
              </Field>
              <Field label="Default cue time" hint="Used when a weekly practice does not have its own reminder plan.">
                <HourSelect
                  value={account.cue_hour}
                  onChange={(cue_hour) => setAccount({ ...account, cue_hour })}
                />
              </Field>
              <Field label="Quiet hours begin" hint="We will not send cues during quiet hours.">
                <HourSelect
                  value={account.quiet_start_hour}
                  onChange={(quiet_start_hour) => setAccount({ ...account, quiet_start_hour })}
                />
              </Field>
              <Field label="Quiet hours end" hint="Reminders can resume after this time.">
                <HourSelect
                  value={account.quiet_end_hour}
                  onChange={(quiet_end_hour) => setAccount({ ...account, quiet_end_hour })}
                />
              </Field>
            </>
          )}
        </div>
        {account.reminder_preference === "email" && paid ? <ReminderBehaviorCard /> : null}
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => void savePreferences()}
            disabled={saving}
            className="inline-flex items-center rounded-xl bg-[#047F6D] px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#036c5d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save preferences
          </button>
        </div>
      </Section>

      <Section icon={CreditCard} title="Membership" description="See your plan and manage billing securely through Stripe.">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-[#041B2D]">{planName}</p>
            <p className="mt-1 text-sm text-slate-600">{billingLabel}</p>
            {account.subscription_end_date && (
              <p className="mt-1 text-sm text-slate-600">
                Current access through {new Date(account.subscription_end_date).toLocaleDateString()}
              </p>
            )}
          </div>
          {paid ? (
            <button
              onClick={() => void openBillingPortal()}
              disabled={portalLoading}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-[#041B2D] shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {portalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Manage billing
            </button>
          ) : (
            <Link href="/upgrade" className="inline-flex items-center justify-center rounded-xl bg-[#6D36C9] px-4 py-2.5 font-semibold text-white hover:bg-[#5b2caf]">
              View membership
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          )}
        </div>
      </Section>

      <Section icon={LockKeyhole} title="Data and privacy" description="Understand what is stored and stay in control of your account.">
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoCard
            title="What LVE360 stores"
            body="Your account, intake answers, Blueprint, supplement stack, goals, check-ins, and weekly practice history are stored to provide your experience."
          />
          <InfoCard
            title="How long it is kept"
            body="Account data is kept while your account is active. You can download it or permanently delete it from this page."
          />
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <a
            href="/api/account/export"
            download
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-[#041B2D] shadow-sm hover:bg-slate-50"
          >
            <Download className="mr-2 h-4 w-4" />
            Download my data
          </a>
          <Link href="/privacy" className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 font-semibold text-[#047F6D] hover:bg-teal-50">
            Read the Privacy Policy
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </Section>

      <Section icon={CircleHelp} title="Help and corrections" description="Health context changes. Your information should be easy to correct.">
        <div className="grid gap-3 sm:grid-cols-2">
          <SupportLink
            href={`mailto:${supportEmail}?subject=${encodeURIComponent("LVE360 report correction")}`}
            title="Correct my report"
            body="Tell us which part of your Blueprint needs attention. Do not include sensitive health details in the email subject."
          />
          <SupportLink
            href={`mailto:${supportEmail}?subject=${encodeURIComponent("LVE360 account support")}`}
            title="Contact support"
            body="Get help with your account, billing, delivery, or dashboard."
          />
        </div>
      </Section>

      <section className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-rose-50 p-2 text-rose-700"><Trash2 className="h-5 w-5" /></div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[#041B2D]">Delete account</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              This permanently deletes your LVE360 account and connected data. Any active subscription is canceled immediately.
            </p>
            {!deleteOpen ? (
              <button onClick={() => setDeleteOpen(true)} className="mt-4 font-semibold text-rose-700 hover:text-rose-800">
                Start account deletion
              </button>
            ) : (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-semibold text-rose-900">This cannot be undone.</p>
                <p className="mt-1 text-sm text-rose-800">
                  Download your data first if you want a copy. Then type <strong>{account.email}</strong> to confirm.
                </p>
                <input
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                  className="mt-3 w-full rounded-xl border border-rose-300 bg-white px-3 py-2.5 text-[#041B2D]"
                  aria-label="Type your email to confirm account deletion"
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    onClick={() => void deleteAccount()}
                    disabled={deleting || deleteConfirmation.trim().toLowerCase() !== account.email.toLowerCase()}
                    className="inline-flex items-center rounded-xl bg-rose-700 px-4 py-2.5 font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Permanently delete my account
                  </button>
                  <button
                    onClick={() => {
                      setDeleteOpen(false);
                      setDeleteConfirmation("");
                    }}
                    disabled={deleting}
                    className="rounded-xl px-4 py-2.5 font-semibold text-slate-700 hover:bg-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-xl bg-[#EAFBF8] p-2 text-[#047F6D]"><Icon className="h-5 w-5" /></div>
        <div>
          <h2 className="text-lg font-bold text-[#041B2D]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#041B2D]">{label}</span>
      <span className="mb-2 mt-0.5 block text-xs text-slate-500">{hint}</span>
      {children}
    </label>
  );
}

function HourSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[#041B2D] shadow-sm focus:border-[#047F6D] focus:ring-2 focus:ring-teal-100"
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <option key={hour} value={hour}>
          {new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, hour)))}
        </option>
      ))}
    </select>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="font-semibold text-[#041B2D]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function SupportLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <a href={href} className="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-teal-300 hover:bg-teal-50">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-[#041B2D]">{title}</p>
        <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#047F6D]" />
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
    </a>
  );
}
