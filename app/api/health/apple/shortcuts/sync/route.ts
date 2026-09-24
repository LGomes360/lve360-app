import { NextRequest, NextResponse } from "next/server";

import { parseHealthShortcutMeasurement, parseHealthShortcutTypes } from "@/lib/healthShortcuts";
import { hashHealthShortcutToken, readHealthShortcutToken } from "@/lib/healthShortcutToken";
import { loadPrivateAccess } from "@/lib/privateAccess";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const token = readHealthShortcutToken(request.headers.get("authorization"));
  if (!token) return json({ ok: false, error: "unauthorized" }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")
    || Number(request.headers.get("content-length") ?? 0) > 4096) {
    return json({ ok: false, error: "invalid_health_payload" }, 400);
  }

  const admin = getSupabaseAdmin();
  const { data: credential, error: credentialError } = await admin
    .from("health_shortcut_tokens")
    .select("user_id,allowed_data_types,expires_at,revoked_at")
    .eq("token_hash", hashHealthShortcutToken(token))
    .maybeSingle();
  if (credentialError) {
    console.error("[health-shortcuts-sync] credential lookup failed", credentialError.message);
    return json({ ok: false, error: "health_sync_unavailable" }, 503);
  }
  if (!credential || credential.revoked_at || new Date(credential.expires_at).getTime() <= Date.now()) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const allowedTypes = parseHealthShortcutTypes(credential.allowed_data_types);
  if (!allowedTypes) return json({ ok: false, error: "unauthorized" }, 401);

  const access = await loadPrivateAccess(credential.user_id).catch((error) => {
    console.error("[health-shortcuts-sync] access lookup failed", error instanceof Error ? error.message : error);
    return null;
  });
  if (!access) return json({ ok: false, error: "health_sync_unavailable" }, 503);
  if (!access.privateAccess) return json({ ok: false, error: "private_access_required" }, 403);

  const { data: preferences, error: preferencesError } = await admin.from("user_preferences")
    .select("timezone").eq("user_id", credential.user_id).maybeSingle();
  if (preferencesError) {
    console.error("[health-shortcuts-sync] timezone lookup failed", preferencesError.message);
    return json({ ok: false, error: "health_sync_unavailable" }, 503);
  }
  const timeZone = preferences?.timezone || "UTC";
  const raw = await request.text().catch(() => "");
  if (raw.length > 4096) return json({ ok: false, error: "invalid_health_payload" }, 400);
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { /* Invalid JSON fails validation below. */ }
  const measurement = parseHealthShortcutMeasurement(body, allowedTypes, timeZone);
  if (!measurement) return json({ ok: false, error: "invalid_health_payload" }, 400);

  const { data: current, error: currentError } = await admin.from("connected_health_daily_metrics")
    .select("steps,sleep_minutes,resting_heart_rate,weight_kg,active_energy_kcal,exercise_minutes")
    .eq("user_id", credential.user_id)
    .eq("provider", "apple_health_shortcuts")
    .eq("local_date", measurement.localDate)
    .maybeSingle();
  if (currentError) {
    console.error("[health-shortcuts-sync] metric lookup failed", currentError.message);
    return json({ ok: false, error: "health_sync_unavailable" }, 500);
  }

  const now = new Date().toISOString();
  const row = {
    user_id: credential.user_id,
    provider: "apple_health_shortcuts",
    local_date: measurement.localDate,
    time_zone: measurement.timeZone,
    steps: current?.steps ?? null,
    sleep_minutes: current?.sleep_minutes ?? null,
    resting_heart_rate: current?.resting_heart_rate ?? null,
    weight_kg: current?.weight_kg ?? null,
    active_energy_kcal: current?.active_energy_kcal ?? null,
    exercise_minutes: current?.exercise_minutes ?? null,
    source_updated_at: now,
    updated_at: now,
    [measurement.column]: measurement.value,
  };
  const { error: metricError } = await admin.from("connected_health_daily_metrics")
    .upsert(row, { onConflict: "user_id,provider,local_date" });
  if (metricError) {
    console.error("[health-shortcuts-sync] metric upsert failed", metricError.message);
    return json({ ok: false, error: "health_sync_unavailable" }, 500);
  }

  const { error: connectionError } = await admin.from("health_data_connections")
    .upsert({
      user_id: credential.user_id,
      provider: "apple_health_shortcuts",
      status: "connected",
      requested_data_types: allowedTypes,
      last_sync_completed_at: now,
      last_sync_error_code: null,
      updated_at: now,
    }, { onConflict: "user_id,provider" });
  if (connectionError) {
    console.error("[health-shortcuts-sync] connection upsert failed", connectionError.message);
    return json({ ok: false, error: "health_sync_unavailable" }, 500);
  }
  const { error: usageError } = await admin.from("health_shortcut_tokens")
    .update({ last_used_at: now, updated_at: now })
    .eq("user_id", credential.user_id)
    .eq("token_hash", hashHealthShortcutToken(token));
  if (usageError) console.error("[health-shortcuts-sync] usage stamp failed", usageError.message);

  return json({ ok: true, local_date: measurement.localDate, type: measurement.type, last_sync_completed_at: now });
}
