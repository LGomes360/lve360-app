import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  APPLE_HEALTH_DATA_TYPES,
  chooseConnectedHealthProvider,
  type AppleHealthDataType,
  type ConnectedHealthProvider,
  type ConnectedHealthDailyMetric,
  type ConnectedHealthSummary,
} from "@/lib/connectedHealth";

type ConnectionRow = {
  provider: ConnectedHealthProvider;
  status: "connected" | "paused" | "disconnected" | "error";
  requested_data_types: string[] | null;
  last_sync_completed_at: string | null;
};

const KNOWN_TYPES = new Set<string>(APPLE_HEALTH_DATA_TYPES);

export async function loadConnectedHealthSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectedHealthSummary | null> {
  const [connectionsResult, nativeMetricsResult, shortcutMetricsResult] = await Promise.all([
    supabase
      .from("health_data_connections")
      .select("provider,status,requested_data_types,last_sync_completed_at")
      .eq("user_id", userId)
      .in("provider", ["apple_health", "apple_health_shortcuts"]),
    supabase
      .from("connected_health_daily_metrics")
      .select("local_date,time_zone,steps,sleep_minutes,resting_heart_rate,weight_kg,active_energy_kcal,exercise_minutes,source_updated_at")
      .eq("user_id", userId)
      .eq("provider", "apple_health")
      .order("local_date", { ascending: false })
      .limit(1),
    supabase
      .from("connected_health_daily_metrics")
      .select("local_date,time_zone,steps,sleep_minutes,resting_heart_rate,weight_kg,active_energy_kcal,exercise_minutes,source_updated_at")
      .eq("user_id", userId)
      .eq("provider", "apple_health_shortcuts")
      .order("local_date", { ascending: false })
      .limit(1),
  ]);

  const error = connectionsResult.error ?? nativeMetricsResult.error ?? shortcutMetricsResult.error;
  if (error) {
    if (isMissingHealthSchemaError(error)) return null;
    console.error("[connected-health] load failed", error.message);
    return null;
  }
  const connections = (connectionsResult.data ?? []) as ConnectionRow[];
  const chosenProvider = chooseConnectedHealthProvider(connections.map((row) => ({
    ...row,
    hasMetrics: row.provider === "apple_health"
      ? Boolean(nativeMetricsResult.data?.length)
      : Boolean(shortcutMetricsResult.data?.length),
  })));
  const connection = connections.find((row) => row.provider === chosenProvider);
  if (!connection) return null;

  const row = connection;
  const metrics = row.provider === "apple_health" ? nativeMetricsResult.data : shortcutMetricsResult.data;
  const latestMetrics = ((metrics ?? []) as ConnectedHealthDailyMetric[]).map(normalizeMetric);
  return {
    provider: row.provider,
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
