import {
  Activity,
  ArrowUpRight,
  BellRing,
  Bot,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { loadFounderDashboard } from "@/src/lib/founderDashboard";
import { isFounderUser } from "@/src/lib/productMode";
import { supabaseServer } from "@/src/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function numberLabel(value: number | null): string {
  return value === null ? "Unavailable" : new Intl.NumberFormat("en-US").format(value);
}

function percentLabel(value: number | null): string {
  return value === null ? "Not enough data" : `${Math.round(value * 100)}%`;
}

function moneyLabel(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

export default async function FounderDashboardPage() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Ffounder");
  if (!isFounderUser(user.id)) redirect("/today");

  const dashboard = await loadFounderDashboard();
  const reminderNeedsAttention = Boolean(dashboard.reminders && (dashboard.reminders.failed > 0 || dashboard.reminders.bounced > 0));
  const aiNeedsAttention = Boolean(dashboard.ai && dashboard.ai.failed > 0);
  const accessNeedsAttention = Boolean((dashboard.access.pendingRequests ?? 0) > 0 || (dashboard.access.expiredInvitations ?? 0) > 0);
  const needsAttention = reminderNeedsAttention || aiNeedsAttention || accessNeedsAttention || dashboard.issues.length > 0;
  const selectedScorecard = dashboard.scorecard.filter((metric) => [
    "activation",
    "action_completed",
    "day_7_return",
    "second_week_start",
    "ask_lve360_usefulness",
  ].includes(metric.key));

  return (
    <div className="space-y-8 pb-12">
      <section className="overflow-hidden rounded-[2rem] border border-[#A8DDD6] bg-[radial-gradient(circle_at_top_right,_rgba(109,54,201,0.12),_transparent_36%),linear-gradient(135deg,#EAFBF8_0%,#FFFFFF_62%,#F7F1FF_100%)] p-6 shadow-sm sm:p-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#087F72]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Founder operations
            </div>
            <h1 className="text-3xl font-black tracking-tight text-[#041B2D] sm:text-5xl">Know what needs your attention.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              A privacy-conscious view of access, engagement, reminders, and AI operations. This dashboard reports aggregate product health and never displays member health records.
            </p>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${needsAttention ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
            {needsAttention ? <CircleAlert className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            {needsAttention ? "Review recommended" : "Core systems look healthy"}
          </div>
        </div>
      </section>

      <section aria-labelledby="access-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Membership</p>
            <h2 id="access-heading" className="mt-1 text-2xl font-black text-[#041B2D]">Access and invitations</h2>
          </div>
          <Link href="/settings/access-requests" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#087F72] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#06695F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2">
            Manage access requests <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Users} label="Private members" value={numberLabel(dashboard.access.privateMembers)} detail="Current member access" />
          <MetricCard icon={KeyRound} label="Requests awaiting review" value={numberLabel(dashboard.access.pendingRequests)} detail="Submitted or in review" attention={(dashboard.access.pendingRequests ?? 0) > 0} />
          <MetricCard
            icon={Sparkles}
            label="Open invitations"
            value={numberLabel(dashboard.access.outstandingInvitations)}
            detail={(dashboard.access.expiredInvitations ?? 0) > 0 ? `${numberLabel(dashboard.access.expiredInvitations)} expired invitation(s) need review` : "Issued and not expired"}
            attention={(dashboard.access.expiredInvitations ?? 0) > 0}
          />
          <MetricCard icon={Activity} label="Accepted in 30 days" value={numberLabel(dashboard.access.acceptedInvitationsLast30Days)} detail="Completed invitation flow" />
        </div>
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
          <Gate label="Access mode" open={dashboard.mode.accessMode === "invite_only"} value={dashboard.mode.accessMode === "invite_only" ? "Private membership" : "Public paid"} />
          <Gate label="Issue new invitations" open={dashboard.mode.invitationIssuanceEnabled} value={dashboard.mode.invitationIssuanceEnabled ? "Enabled" : "Paused"} />
          <Gate label="Accept issued invitations" open={dashboard.mode.invitationAcceptanceEnabled} value={dashboard.mode.invitationAcceptanceEnabled ? "Enabled" : "Paused"} />
        </div>
      </section>

      <section aria-labelledby="engagement-heading" className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Member value</p>
          <h2 id="engagement-heading" className="mt-1 text-2xl font-black text-[#041B2D]">Engagement and follow-through</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <MetricCard icon={Users} label="Active members" value={numberLabel(dashboard.engagement.activeMembersLast7Days)} detail="Distinct members with activity in 7 days" />
            <MetricCard icon={Activity} label="Active weekly practices" value={numberLabel(dashboard.engagement.activeWeeklyPractices)} detail="Practices currently in progress" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-black text-[#041B2D]">Learning scorecard</h3>
            <p className="mt-1 text-sm text-slate-600">The strongest early signals that LVE360 is helping members follow through.</p>
            {selectedScorecard.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {selectedScorecard.map((metric) => (
                  <div key={metric.key} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-600">{metric.label}</p>
                    <p className="mt-2 text-2xl font-black text-[#041B2D]">{percentLabel(metric.rate)}</p>
                    <p className="mt-1 text-xs text-slate-500">{metric.numerator} of {metric.denominator}</p>
                  </div>
                ))}
              </div>
            ) : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No scorecard data is available yet.</p>}
          </div>
        </div>
      </section>

      <section aria-labelledby="operations-heading" className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087F72]">Reliability and cost</p>
          <h2 id="operations-heading" className="mt-1 text-2xl font-black text-[#041B2D]">Core operations</h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-[#087F72]" aria-hidden="true" /><h3 className="font-black text-[#041B2D]">Reminder delivery</h3></div>
                <p className="mt-1 text-sm text-slate-600">Last 7 days</p>
              </div>
              <StatusBadge attention={reminderNeedsAttention} />
            </div>
            {dashboard.reminders ? (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <SmallMetric label="Delivery rate" value={percentLabel(dashboard.reminders.deliveryRate)} />
                <SmallMetric label="Delivered" value={String(dashboard.reminders.delivered)} />
                <SmallMetric label="Accepted" value={String(dashboard.reminders.accepted)} />
                <SmallMetric label="Failed" value={String(dashboard.reminders.failed)} attention={dashboard.reminders.failed > 0} />
                <SmallMetric label="Bounced" value={String(dashboard.reminders.bounced)} attention={dashboard.reminders.bounced > 0} />
                <SmallMetric label="Skipped" value={String(dashboard.reminders.skipped)} />
              </div>
            ) : <Unavailable />}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-[#6D36C9]" aria-hidden="true" /><h3 className="font-black text-[#041B2D]">AI operations</h3></div>
                <p className="mt-1 text-sm text-slate-600">Last 30 days</p>
              </div>
              <StatusBadge attention={aiNeedsAttention} />
            </div>
            {dashboard.ai ? (
              <>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <SmallMetric label="Generations" value={String(dashboard.ai.generations)} />
                  <SmallMetric label="Estimated cost" value={moneyLabel(dashboard.ai.estimatedCostUsd)} />
                  <SmallMetric label="Failures" value={String(dashboard.ai.failed)} attention={dashboard.ai.failed > 0} />
                  <SmallMetric label="Fallbacks" value={String(dashboard.ai.fallbackUsed)} attention={dashboard.ai.fallbackUsed > 0} />
                  <SmallMetric label="Avg latency" value={dashboard.ai.averageLatencyMs === null ? "No data" : `${(dashboard.ai.averageLatencyMs / 1_000).toFixed(1)}s`} />
                </div>
                {dashboard.ai.topTasks.length > 0 ? (
                  <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-[32rem] w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">AI task</th><th className="px-4 py-3 text-right">Uses</th><th className="px-4 py-3 text-right">Cost</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {dashboard.ai.topTasks.map((task) => <tr key={task.task}><td className="px-4 py-3 font-semibold text-[#041B2D]">{task.task}</td><td className="px-4 py-3 text-right text-slate-600">{task.generations}</td><td className="px-4 py-3 text-right text-slate-600">{moneyLabel(task.estimatedCostUsd)}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : <Unavailable />}
          </div>
        </div>
      </section>

      {dashboard.issues.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-labelledby="limited-data-heading">
          <div className="flex gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" /><div><h2 id="limited-data-heading" className="font-black text-amber-950">Limited reporting data</h2><ul className="mt-2 space-y-1 text-sm text-amber-900">{dashboard.issues.map((issue) => <li key={issue}>• {issue}</li>)}</ul></div></div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-black text-[#041B2D]">Operations shortcuts</h2><p className="mt-1 text-sm text-slate-600">Open the source systems when a metric needs deeper investigation.</p></div>
          <div className="flex flex-wrap gap-2">
            <ExternalLink href="https://vercel.com/luke-gomes-projects/lve360-app-itik">Vercel</ExternalLink>
            <ExternalLink href="https://supabase.com/dashboard/project/splafvdwllglorcegxam">Supabase</ExternalLink>
            <ExternalLink href="https://github.com/LGomes360/lve360-app">GitHub</ExternalLink>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">Updated {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Denver" }).format(new Date(dashboard.generatedAt))} Mountain Time. Refresh this page for current data.</p>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail, attention = false }: { icon: typeof Users; label: string; value: string; detail: string; attention?: boolean }) {
  return <div className={`rounded-2xl border bg-white p-5 shadow-sm ${attention ? "border-amber-300" : "border-slate-200"}`}><div className="flex items-center justify-between"><Icon className="h-5 w-5 text-[#087F72]" aria-hidden="true" />{attention ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">Review</span> : null}</div><p className="mt-5 text-sm font-semibold text-slate-600">{label}</p><p className="mt-1 text-3xl font-black text-[#041B2D]">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></div>;
}

function Gate({ label, open, value }: { label: string; open: boolean; value: string }) {
  return <div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${open ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" /><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="font-bold text-[#041B2D]">{value}</p></div></div>;
}

function SmallMetric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return <div className={`rounded-xl p-3 ${attention ? "bg-red-50" : "bg-slate-50"}`}><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-1 text-lg font-black ${attention ? "text-red-700" : "text-[#041B2D]"}`}>{value}</p></div>;
}

function StatusBadge({ attention }: { attention: boolean }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${attention ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{attention ? "Review" : "Healthy"}</span>;
}

function Unavailable() {
  return <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">This operational signal is temporarily unavailable. Other dashboard sections remain usable.</p>;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-[#041B2D] transition hover:border-[#087F72] hover:text-[#087F72] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F72] focus-visible:ring-offset-2">{children}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>;
}
