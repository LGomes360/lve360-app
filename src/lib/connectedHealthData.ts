import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  APPLE_HEALTH_DATA_TYPES,
  type AppleHealthDataType,
  type ConnectedHealthDailyMetric,
  type ConnectedHealthSummary,
} from "@/lib/connectedHealth";

type ConnectionRow = {
  provider: "apple_health";
  status: "connected" | "paused" | "disconnected" | "error";
  requested_data_types: string[] | null;
  last_sync_completed_at: string | null;
};

const KNOWN_TYPES = new Set<string>(APPLE_HEALTH_DATA_TYPES);

export async function loadConnectedHealthSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectedHealthSummary | null> {
  const [{ data: connection, error: connectionError }, { data: metrics, error: metricsError }] = await Promise.all([
    supabase
      .from("health_data_connections")
      .select("provider,status,requested_data_types,last_sync_completed_at")
      .eq("user_id", userId)
      .eq("provider", "apple_health")
      .maybeSingle(),
    supabase
      .from("connected_health_daily_metrics")
      .select("local_date,time_zone,steps,sleep_minutes,resting_heart_rate,weight_kg,active_energy_kcal,exercise_minutes,source_updated_at")
      .eq("user_id", userId)
      .eq("provider", "apple_health")
      .order("local_date", { ascending: false })
      .limit(1),
  ]);

  if (connectionError || metricsError) {
    if (isMissingHealthSchemaError(connectionError) || isMissingHealthSchemaError(metricsError)) return null;
    console.error("[connected-health] load failed", connectionError?.message ?? metricsError?.message);
    return null;
  }
  if (!connection) return null;

  const row = connection as ConnectionRow;
  const latestMetrics = ((metrics ?? []) as ConnectedHealthDailyMetric[]).map(normalizeMetric);
  return {
    provider: "apple_health",
    status: row.status,
    requestedDataTypes: (row.requested_data_types ?? [])
      .filter((item): item is AppleHealthDataType => KNOWN_TYPES.has(item)),
    lastSyncCompletedAt: row.last_sync_completed_at,
    latest: latestMetrics[0] ?? null,
  };
}

function isMissingHealthSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01"
    || error.code === "PGRST205"
    || error.message?.includes("schema cache") === true;
}

function normalizeMetric(metric: ConnectedHealthDailyMetric): ConnectedHealthDailyMetric {
  return {
    ...metric,
    steps: toNumber(metric.steps),
    sleep_minutes: toNumber(metric.sleep_minutes),
    resting_heart_rate: toNumber(metric.resting_heart_rate),
    weight_kg: toNumber(metric.weight_kg),
    active_energy_kcal: toNumber(metric.active_energy_kcal),
    exercise_minutes: toNumber(metric.exercise_minutes),
  };
}

function toNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
