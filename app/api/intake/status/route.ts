// app/api/intake/status/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);

  try {
    // 1) Auth
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user?.id) {
      console.warn("[intake/status] unauthorized:", userErr?.message);
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    // 2) Params
    const stackId = url.searchParams.get("stack_id");
    if (!stackId) {
      console.warn("[intake/status] missing stack_id");
      return NextResponse.json({ ok: false, error: "stack_id_required" }, { status: 400 });
    }

    // UTC "today" (YYYY-MM-DD). If you prefer local days, pass a tz param and adjust here.
    const today = new Date().toISOString().slice(0, 10);

    console.log("[intake/status] start", { userId, stackId, today });

    // 3) Fetch item_ids in this stack for this user
    const { data: stackItems, error: itemsErr } = await supabase
      .from("stacks_items")
      .select("item_id")
      .eq("user_id", userId)
      .eq("stack_id", stackId);

    if (itemsErr) {
      console.error("[intake/status] stacks_items error:", itemsErr);
      throw itemsErr;
    }

    const itemIds = (stackItems ?? []).map((r) => r.item_id).filter(Boolean);
    console.log("[intake/status] stack items", { count: itemIds.length, itemIds });

    // If the stack has no items yet, return empty statuses (nothing to check off)
    if (itemIds.length === 0) {
      return NextResponse.json({ ok: true, date: today, statuses: {} });
    }

    // 4) Fetch intake events for *today* for those items
    const { data: events, error: evErr } = await supabase
      .from("intake_events")
      .select("item_id, taken")
      .eq("user_id", userId)
      .eq("intake_date", today)
      .in("item_id", itemIds);

    if (evErr) {
      console.error("[intake/status] intake_events error:", evErr);
      throw evErr;
    }

    console.log("[intake/status] events", { count: events?.length ?? 0 });

    // 5) Build map: default to false for every item in the stack, then apply today's events
    const map: Record<string, boolean> = {};
    for (const id of itemIds) map[id as string] = false;
    for (const row of events ?? []) map[row.item_id as string] = !!row.taken;

    console.log("[intake/status] done", { keys: Object.keys(map).length });

    return NextResponse.json({ ok: true, date: today, statuses: map });
  } catch (e: any) {
    console.error("[intake/status] unhandled error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "status_failed" }, { status: 500 });
  }
}
