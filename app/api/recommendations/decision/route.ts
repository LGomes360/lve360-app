import { NextResponse } from "next/server";

import { isMemberRecommendationDecision } from "@/lib/recommendationDecision";
import { updateRecommendationDecision } from "@/lib/recommendationDecisionData";
import { requirePaidApi } from "@/lib/serverEntitlements";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  const body = await req.json().catch(() => null) as { item_id?: unknown; decision?: unknown } | null;
  const itemId = typeof body?.item_id === "string" ? body.item_id.trim() : "";
  if (!itemId) return NextResponse.json({ ok: false, error: "item_id_required" }, { status: 400 });
  if (!isMemberRecommendationDecision(body?.decision)) {
    return NextResponse.json({ ok: false, error: "invalid_decision" }, { status: 400 });
  }

  try {
    const decision = await updateRecommendationDecision(entitlement.user.id, itemId, body.decision);
    if (!decision) {
      return NextResponse.json({ ok: false, error: "recommendation_decision_unavailable" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, decision });
  } catch (error) {
    console.error("[recommendations/decision] failed", error);
    return NextResponse.json({ ok: false, error: "recommendation_decision_failed" }, { status: 500 });
  }
}
