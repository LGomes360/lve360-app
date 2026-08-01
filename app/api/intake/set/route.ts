import { NextResponse } from "next/server";

import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const userId = entitlement.user.id;
    const body = await req.json().catch(() => null) as {
      regimen_item_id?: string;
      item_id?: string;
      taken?: boolean;
    } | null;
    const regimenItemId = body?.regimen_item_id ?? body?.item_id;
    const taken = body?.taken;
    if (!regimenItemId || typeof taken !== "boolean") {
      return NextResponse.json({ ok: false, error: "regimen_item_id_and_taken_required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: ownedItem, error: itemError } = await admin
      .from("current_regimen_items")
      .select("id")
      .eq("id", regimenItemId)
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!ownedItem) {
      return NextResponse.json({ ok: false, error: "regimen_item_not_found" }, { status: 404 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { error } = await admin.from("intake_events").upsert(
      { user_id: userId, regimen_item_id: regimenItemId, intake_date: today, taken },
      { onConflict: "user_id,regimen_item_id,intake_date" }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true, regimen_item_id: regimenItemId, date: today, taken });
  } catch (error) {
    const message = error instanceof Error ? error.message : "set_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
