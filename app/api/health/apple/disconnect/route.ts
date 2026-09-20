import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization")?.trim() ?? "");
  const accessToken = match?.[1]?.trim();
  if (!accessToken) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { error: deletionError } = await admin
    .from("connected_health_daily_metrics")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "apple_health");
  if (deletionError) {
    console.error("[apple-health-disconnect] metric removal failed", deletionError.message);
    return NextResponse.json({ ok: false, error: "health_disconnect_unavailable" }, { status: 500 });
  }

  const { error: connectionError } = await admin
    .from("health_data_connections")
    .update({
      status: "disconnected",
      requested_data_types: [],
      last_sync_error_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("provider", "apple_health");
  if (connectionError) {
    console.error("[apple-health-disconnect] connection update failed", connectionError.message);
    return NextResponse.json({ ok: false, error: "health_disconnect_unavailable" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, provider: "apple_health" });
}
