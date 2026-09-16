import "server-only";

import { getProductMode } from "./productMode";
import { getSupabaseAdmin } from "./supabaseAdmin";

const ROW_LIMIT = 5_000;

type ReminderStatus = "queued" | "accepted" | "delivered" | "bounced" | "failed" | "skipped";

export type FounderDashboardData = {
  generatedAt: string;
  mode: {
    accessMode: string;
    invitationIssuanceEnabled: boolean;
    invitationAcceptanceEnabled: boolean;
  };
  access: {
    privateMembers: number | null;
    pendingRequests: number | null;
    outstandingInvitations: number | null;
    expiredInvitations: number | null;
    acceptedInvitationsLast30Days: number | null;
  };
  engagement: {
    activeMembersLast7Days: number | null;
    activeWeeklyPractices: number | null;
  };
  reminders: {
    accepted: number;
    delivered: number;
    failed: number;
    bounced: number;
    skipped: number;
    deliveryRate: number | null;
    truncated: boolean;
  } | null;
  ai: {
    generations: number;
    failed: number;
    fallbackUsed: number;
    estimatedCostUsd: number;
    averageLatencyMs: number | null;
    topTasks: Array<{ task: string; generations: number; estimatedCostUsd: number }>;
    truncated: boolean;
  } | null;
  scorecard: Array<{
    key: string;
    label: string;
    numerator: number;
    denominator: number;
    rate: number | null;
  }>;
  issues: string[];
};

type AiLedgerRow = {
  task: string;
  status: "succeeded" | "failed";
  fallback_used: boolean;
  latency_ms: number;
  estimated_cost_usd: number | string | null;
};

type ScorecardRow = {
  metric_key: string;
  metric_label: string;
  numerator: number | string;
  denominator: number | string;
  rate: number | string | null;
};

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadFounderDashboard(): Promise<FounderDashboardData> {
  const admin = getSupabaseAdmin();
  const mode = getProductMode();
  const now = new Date();
  const nowIso = now.toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000).toISOString();

  const [
    memberResult,
    requestResult,
    issuedResult,
    expiredResult,
    acceptedResult,
    practiceResult,
    activityResult,
    reminderResult,
    aiResult,
    scorecardResult,
  ] = await Promise.all([
    admin.from("users").select("id", { count: "exact", head: true }).eq("access_status", "private_member"),
    admin.from("access_requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "reviewing"]),
    admin.from("invitations").select("id", { count: "exact", head: true }).eq("status", "issued").gt("expires_at", nowIso),
    admin.from("invitations").select("id", { count: "exact", head: true }).eq("status", "issued").lte("expires_at", nowIso),
    admin.from("invitations").select("id", { count: "exact", head: true }).eq("status", "accepted").gte("accepted_at", thirtyDaysAgo),
    admin.from("weekly_experiments").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("product_events").select("user_id").not("user_id", "is", null).gte("created_at", sevenDaysAgo).limit(ROW_LIMIT),
    admin.from("reminder_deliveries").select("status").gte("created_at", sevenDaysAgo).limit(ROW_LIMIT),
    admin
      .from("ai_generation_ledger")
      .select("task,status,fallback_used,latency_ms,estimated_cost_usd")
      .gte("created_at", thirtyDaysAgo)
      .limit(ROW_LIMIT),
    admin.rpc("founder_paid_beta_learning_scorecard"),
  ]);

  const issues: string[] = [];
  const countOrNull = (label: string, result: { count: number | null; error: { message: string } | null }) => {
    if (result.error) {
      issues.push(`${label} is unavailable: ${result.error.message}`);
      return null;
    }
    return result.count ?? 0;
  };

  const privateMembers = countOrNull("Private member count", memberResult);
  const pendingRequests = countOrNull("Access request count", requestResult);
  const outstandingInvitations = countOrNull("Outstanding invitation count", issuedResult);
  const expiredInvitations = countOrNull("Expired invitation count", expiredResult);
  const acceptedInvitationsLast30Days = countOrNull("Recent invitation acceptance count", acceptedResult);
  const activeWeeklyPractices = countOrNull("Active weekly practice count", practiceResult);

  let activeMembersLast7Days: number | null = null;
  if (activityResult.error) {
    issues.push(`Recent member activity is unavailable: ${activityResult.error.message}`);
  } else {
    activeMembersLast7Days = new Set(
      (activityResult.data ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id)),
    ).size;
    if ((activityResult.data?.length ?? 0) === ROW_LIMIT) {
      issues.push("Recent member activity reached the reporting limit; the active-member count may be understated.");
    }
  }

  let reminders: FounderDashboardData["reminders"] = null;
  if (reminderResult.error) {
    issues.push(`Reminder delivery health is unavailable: ${reminderResult.error.message}`);
  } else {
    const statusCounts = new Map<ReminderStatus, number>();
    for (const row of reminderResult.data ?? []) {
      const status = row.status as ReminderStatus;
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    }
    const delivered = statusCounts.get("delivered") ?? 0;
    const failed = statusCounts.get("failed") ?? 0;
    const bounced = statusCounts.get("bounced") ?? 0;
    const terminal = delivered + failed + bounced;
    reminders = {
      accepted: statusCounts.get("accepted") ?? 0,
      delivered,
      failed,
      bounced,
      skipped: statusCounts.get("skipped") ?? 0,
      deliveryRate: terminal > 0 ? delivered / terminal : null,
      truncated: (reminderResult.data?.length ?? 0) === ROW_LIMIT,
    };
    if (reminders.truncated) {
      issues.push("Reminder delivery reporting reached the row limit; the seven-day totals may be understated.");
    }
  }

  let ai: FounderDashboardData["ai"] = null;
  if (aiResult.error) {
    issues.push(`AI operational health is unavailable: ${aiResult.error.message}`);
  } else {
    const rows = (aiResult.data ?? []) as AiLedgerRow[];
    const taskTotals = new Map<string, { generations: number; estimatedCostUsd: number }>();
    let estimatedCostUsd = 0;
    let totalLatencyMs = 0;
    let failed = 0;
    let fallbackUsed = 0;
    for (const row of rows) {
      const cost = numberValue(row.estimated_cost_usd);
      estimatedCostUsd += cost;
      totalLatencyMs += numberValue(row.latency_ms);
      if (row.status === "failed") failed += 1;
      if (row.fallback_used) fallbackUsed += 1;
      const current = taskTotals.get(row.task) ?? { generations: 0, estimatedCostUsd: 0 };
      current.generations += 1;
      current.estimatedCostUsd += cost;
      taskTotals.set(row.task, current);
    }
    ai = {
      generations: rows.length,
      failed,
      fallbackUsed,
      estimatedCostUsd,
      averageLatencyMs: rows.length > 0 ? Math.round(totalLatencyMs / rows.length) : null,
      topTasks: [...taskTotals.entries()]
        .map(([task, values]) => ({ task, ...values }))
        .sort((left, right) => right.estimatedCostUsd - left.estimatedCostUsd || right.generations - left.generations)
        .slice(0, 5),
      truncated: rows.length === ROW_LIMIT,
    };
    if (ai.truncated) {
      issues.push("AI operations reporting reached the row limit; the 30-day totals may be understated.");
    }
  }

  let scorecard: FounderDashboardData["scorecard"] = [];
  if (scorecardResult.error) {
    issues.push(`Learning scorecard is unavailable: ${scorecardResult.error.message}`);
  } else {
    scorecard = ((scorecardResult.data ?? []) as ScorecardRow[]).map((row) => ({
      key: row.metric_key,
      label: row.metric_label,
      numerator: numberValue(row.numerator),
      denominator: numberValue(row.denominator),
      rate: row.rate === null ? null : numberValue(row.rate),
    }));
  }

  return {
    generatedAt: nowIso,
    mode: {
      accessMode: mode.accessMode,
      invitationIssuanceEnabled: mode.invitationIssuanceEnabled,
      invitationAcceptanceEnabled: mode.invitationAcceptanceEnabled,
    },
    access: {
      privateMembers,
      pendingRequests,
      outstandingInvitations,
      expiredInvitations,
      acceptedInvitationsLast30Days,
    },
    engagement: {
      activeMembersLast7Days,
      activeWeeklyPractices,
    },
    reminders,
    ai,
    scorecard,
    issues,
  };
}
