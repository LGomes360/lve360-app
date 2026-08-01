import { NextResponse } from "next/server";

import { getCurrentRegimen } from "@/lib/currentRegimen";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const userId = entitlement.user.id;
    const today = new Date().toISOString().slice(0, 10);
    const regimen = await getCurrentRegimen(userId);
    const itemIds = regimen.map((item) => item.id);
    const statuses = Object.fromEntries(itemIds.map((id) => [id, false])) as Record<string, boolean>;
    if (!itemIds.length) return NextResponse.json({ ok: true, date: today, statuses });

    const { data, error } = await getSupabaseAdmin()
      .from("intake_events")
      .select("regimen_item_id,taken")
      .eq("user_id", userId)
      .eq("intake_date", today)
      .in("regimen_item_id", itemIds);
    if (error) throw error;
    for (const event of data ?? []) {
      if (event.regimen_item_id) statuses[event.regimen_item_id] = Boolean(event.taken);
    }
    return NextResponse.json({ ok: true, date: today, statuses });
  } catch (error) {
    console.error("[intake/status] failed", error);
    const message = error instanceof Error ? error.message : "status_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
