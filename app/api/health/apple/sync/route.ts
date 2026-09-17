import { NextRequest, NextResponse } from "next/server";

import { validateAppleHealthSyncPayload } from "@/lib/connectedHealth";
import { loadPrivateAccess } from "@/lib/privateAccess";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const accessToken = readBearerToken(request.headers.get("authorization"));
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const access = await loadPrivateAccess(user.id).catch((error) => {
    console.error("[apple-health-sync] access lookup failed", error instanceof Error ? error.message : error);
    return null;
  });
  if (!access) {
    return NextResponse.json({ ok: false, error: "health_sync_unavailable" }, { status: 503 });
  }
  if (!access.privateAccess) {
    return NextResponse.json({ ok: false, error: "private_access_required" }, { status: 403 });
  }

  const payload = validateAppleHealthSyncPayload(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ ok: false, error: "invalid_health_payload" }, { status: 400 });
  }

  const syncedAt = new Date().toISOString();
  const rows = payload.days.map((day) => ({
    ...day,
    user_id: user.id,
    provider: "apple_health",
    updated_at: syncedAt,
  }));

  const { error: metricError } = await admin
    .from("connected_health_daily_metrics")
    .upsert(rows, { onConflict: "user_id,provider,local_date" });
  if (metricError) {
    console.error("[apple-health-sync] metric upsert failed", metricError.message);
    return NextResponse.json({ ok: false, error: "health_sync_unavailable" }, { status: 500 });
  }

  const { error: connectionError } = await admin
    .from("health_data_connections")
    .upsert({
      user_id: user.id,
      provider: "apple_health",
      status: "connected",
      requested_data_types: payload.requested_data_types,
      last_sync_completed_at: syncedAt,
      last_sync_error_code: null,
      updated_at: syncedAt,
    }, { onConflict: "user_id,provider" });
  if (connectionError) {
    console.error("[apple-health-sync] connection upsert failed", connectionError.message);
    return NextResponse.json({ ok: false, error: "health_sync_unavailable" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    provider: "apple_health",
    imported_days: rows.length,
    last_sync_completed_at: syncedAt,
  });
}

function readBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() || null;
}
