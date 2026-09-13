import { NextResponse, type NextRequest } from "next/server";

import { getExcludedCoachContextIds, setCoachContextPreference } from "@/lib/coachContextPreferencesData";
import { isExcludableCoachContextId } from "@/lib/coachPersonalization";
import { requirePaidApi } from "@/lib/serverEntitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;
  try {
    return NextResponse.json({
      ok: true,
      excluded_source_ids: await getExcludedCoachContextIds(entitlement.user.id),
    });
  } catch (error) {
    console.error("[coach.context] load failed", error);
    return NextResponse.json({ ok: false, error: "context_preferences_unavailable" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;
  const body = await req.json().catch(() => null);
  if (!isExcludableCoachContextId(body?.source_id) || typeof body?.excluded !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_context_preference" }, { status: 400 });
  }
  try {
    return NextResponse.json({
      ok: true,
      excluded_source_ids: await setCoachContextPreference({
        userId: entitlement.user.id,
        sourceId: body.source_id,
        excluded: body.excluded,
      }),
    });
  } catch (error) {
    console.error("[coach.context] save failed", error);
    return NextResponse.json({ ok: false, error: "context_preferences_unavailable" }, { status: 500 });
  }
}
