import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

import { parseHealthShortcutTypes } from "@/lib/healthShortcuts";
import { createHealthShortcutToken, hashHealthShortcutToken } from "@/lib/healthShortcutToken";
import { loadPrivateAccess } from "@/lib/privateAccess";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function currentMember() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { userId: null, error: json({ ok: false, error: "unauthorized" }, 401) };
  const access = await loadPrivateAccess(user.id).catch((error) => {
    console.error("[health-shortcuts-key] access lookup failed", error instanceof Error ? error.message : error);
    return null;
  });
  if (!access) return { userId: null, error: json({ ok: false, error: "health_sync_unavailable" }, 503) };
  if (!access.privateAccess) return { userId: null, error: json({ ok: false, error: "private_access_required" }, 403) };
  return { userId: user.id, error: null };
}

function sameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function GET() {
  const member = await currentMember();
  if (!member.userId) return member.error ?? json({ ok: false, error: "unauthorized" }, 401);

  const { data, error } = await getSupabaseAdmin()
    .from("health_shortcut_tokens")
    .select("allowed_data_types,created_at,expires_at,last_used_at,revoked_at")
    .eq("user_id", member.userId)
    .maybeSingle();
  if (error) {
    console.error("[health-shortcuts-key] status lookup failed", error.message);
    return json({ ok: false, error: "health_sync_unavailable" }, 503);
  }
  const active = Boolean(data && !data.revoked_at && new Date(data.expires_at).getTime() > Date.now());
  return json({
    ok: true,
    active,
    requested_data_types: active ? data?.allowed_data_types : [],
    created_at: active ? data?.created_at : null,
    expires_at: active ? data?.expires_at : null,
    last_used_at: active ? data?.last_used_at : null,
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ ok: false, error: "invalid_origin" }, 403);
  const member = await currentMember();
  if (!member.userId) return member.error ?? json({ ok: false, error: "unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  const requested = parseHealthShortcutTypes(body?.requested_data_types);
  if (!requested || requested.length !== 1 || requested[0] !== "steps") {
    return json({ ok: false, error: "invalid_health_scopes" }, 400);
  }

  const token = createHealthShortcutToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 86_400_000).toISOString();
  const { error } = await getSupabaseAdmin().from("health_shortcut_tokens").upsert({
    user_id: member.userId,
    token_hash: hashHealthShortcutToken(token),
    allowed_data_types: requested,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: expiresAt,
    last_used_at: null,
    revoked_at: null,
  }, { onConflict: "user_id" });
  if (error) {
    console.error("[health-shortcuts-key] issuance failed", error.message);
    return json({ ok: false, error: "health_sync_unavailable" }, 503);
  }
  return json({ ok: true, token, requested_data_types: requested, expires_at: expiresAt });
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return json({ ok: false, error: "invalid_origin" }, 403);
  const member = await currentMember();
  if (!member.userId) return member.error ?? json({ ok: false, error: "unauthorized" }, 401);
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error: revokeError } = await admin.from("health_shortcut_tokens")
    .update({ revoked_at: now, updated_at: now })
    .eq("user_id", member.userId);
  if (revokeError) {
    console.error("[health-shortcuts-key] revoke failed", revokeError.message);
    return json({ ok: false, error: "health_disconnect_unavailable" }, 503);
  }
  const { error: metricError } = await admin.from("connected_health_daily_metrics")
    .delete().eq("user_id", member.userId).eq("provider", "apple_health_shortcuts");
  if (metricError) {
    console.error("[health-shortcuts-key] metric removal failed", metricError.message);
    return json({ ok: false, error: "health_disconnect_unavailable" }, 500);
  }
  const { error: connectionError } = await admin.from("health_data_connections")
    .update({ status: "disconnected", requested_data_types: [], updated_at: now })
    .eq("user_id", member.userId).eq("provider", "apple_health_shortcuts");
  if (connectionError) {
    console.error("[health-shortcuts-key] connection update failed", connectionError.message);
    return json({ ok: false, error: "health_disconnect_unavailable" }, 500);
  }
  return json({ ok: true, removed_imported_data: true });
}
