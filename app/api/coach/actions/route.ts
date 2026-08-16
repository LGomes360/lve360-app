import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { coachActionFromRow, type CoachActionStatus } from "@/lib/coachActions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROPOSAL_COLUMNS = "id,source_turn_id,status,identity_direction,action_label,cue,frequency_per_week,minimum_version,rationale,confirmed_at,cancelled_at,applied_at,applied_experiment_id,created_at";

async function requirePaidUser() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) return { error: "unauthorized" as const, user: null };
  const { data: profile, error: profileError } = await getSupabaseAdmin()
    .from("users").select("tier").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (profile?.tier !== "premium" && profile?.tier !== "trial") return { error: "premium_required" as const, user: null };
  return { error: null, user };
}

function authResponse(error: "unauthorized" | "premium_required") {
  return NextResponse.json({ ok: false, error }, { status: error === "unauthorized" ? 401 : 403 });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authResponse(auth.error ?? "unauthorized");
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const proposalId = typeof body?.proposal_id === "string" ? body.proposal_id : "";
    const action = body?.action;
    if (!proposalId || (action !== "confirm" && action !== "cancel")) {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: existing, error: loadError } = await admin.from("coach_action_proposals")
      .select(PROPOSAL_COLUMNS).eq("id", proposalId).eq("user_id", auth.user.id).maybeSingle();
    if (loadError) throw loadError;
    if (!existing) return NextResponse.json({ ok: false, error: "proposal_not_found" }, { status: 404 });

    const currentStatus = existing.status as CoachActionStatus;
    const targetStatus: CoachActionStatus = action === "confirm" ? "confirmed" : "cancelled";
    if (currentStatus === targetStatus || (action === "confirm" && currentStatus === "applied")) {
      return NextResponse.json({ ok: true, proposal: coachActionFromRow(existing) });
    }
    if (currentStatus === "applied" || (action === "confirm" && currentStatus === "cancelled")) {
      return NextResponse.json({ ok: false, error: "invalid_transition" }, { status: 409 });
    }

    const now = new Date().toISOString();
    if (action === "confirm") {
      const { error: replaceError } = await admin.from("coach_action_proposals").update({
        status: "cancelled",
        cancelled_at: now,
        updated_at: now,
      }).eq("user_id", auth.user.id).eq("status", "confirmed").neq("id", proposalId);
      if (replaceError) throw replaceError;
    }
    const changes = action === "confirm"
      ? { status: targetStatus, confirmed_at: now, cancelled_at: null, updated_at: now }
      : { status: targetStatus, cancelled_at: now, updated_at: now };
    const { data, error } = await admin.from("coach_action_proposals").update(changes)
      .eq("id", proposalId).eq("user_id", auth.user.id).eq("status", currentStatus)
      .select(PROPOSAL_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: concurrent, error: concurrentError } = await admin.from("coach_action_proposals")
        .select(PROPOSAL_COLUMNS).eq("id", proposalId).eq("user_id", auth.user.id).maybeSingle();
      if (concurrentError) throw concurrentError;
      if (concurrent?.status === targetStatus || (action === "confirm" && concurrent?.status === "applied")) {
        return NextResponse.json({ ok: true, proposal: coachActionFromRow(concurrent) });
      }
      return NextResponse.json({ ok: false, error: "invalid_transition" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, proposal: coachActionFromRow(data) });
  } catch (error) {
    console.error("[coach.actions] update failed", error);
    return NextResponse.json({ ok: false, error: "coach_action_unavailable" }, { status: 500 });
  }
}
