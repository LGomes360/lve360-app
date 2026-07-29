export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = false;

import { NextResponse } from "next/server";

import { getRequestEntitlement } from "@/lib/serverEntitlements";

export async function GET() {
  try {
    const entitlement = await getRequestEntitlement();
    if (!entitlement.user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        ok: true,
        tier: entitlement.tier,
        user_id: entitlement.user.id,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }
    );
  } catch (error) {
    console.error("[users/tier] lookup failed", error);
    return NextResponse.json({ ok: false, error: "tier_unavailable" }, { status: 500 });
  }
}
