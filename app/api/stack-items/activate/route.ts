import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { adoptStackRecommendation } from "@/lib/currentRegimen";
import { requirePaidApi } from "@/lib/serverEntitlements";

export async function POST(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { item_id?: string } | null;
  if (!body?.item_id) return NextResponse.json({ ok: false, error: "item_id_required" }, { status: 400 });
  try {
    const regimenItem = await adoptStackRecommendation(user.id, body.item_id);
    if (!regimenItem) return NextResponse.json({ ok: false, error: "item_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, item: regimenItem });
  } catch (error) {
    const message = error instanceof Error ? error.message : "recommendation_adoption_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
