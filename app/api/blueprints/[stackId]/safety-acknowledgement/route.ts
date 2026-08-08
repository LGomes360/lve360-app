import { NextResponse } from "next/server";

import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type RouteContext = { params: Promise<{ stackId: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  const { stackId } = await params;
  const acknowledgedAt = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("stacks")
    .update({ safety_acknowledged_at: acknowledgedAt })
    .eq("id", stackId)
    .eq("user_id", entitlement.user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[blueprints/safety-acknowledgement] save failed", error);
    return NextResponse.json({ ok: false, error: "safety_acknowledgement_unavailable" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "blueprint_not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, acknowledged_at: acknowledgedAt });
}
