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

    const today = new Date().toISOString().slice(0, 10);
    console.log("[intake/status] start", { userId, stackId, today });

    // 3) Get the *item ids* that belong to this stack (PK is 'id' on stacks_items)
    const { data: stackItems, error: itemsErr } = await supabase
      .from("stacks_items")
      .select("id") // <-- correct column (item_id does not exist here)
      .eq("user_id", userId)
      .eq("stack_id", stackId);

    if (itemsErr) {
      console.error("[intake/status] stacks_items error:", itemsErr);
      throw itemsErr;
    }

    const itemIds = (stackItems ?? []).map((r) => r.id).filter(Boolean);
    console.log("[intake/status] stack items", { count: itemIds.length });

    if (itemIds.length === 0) {
      return NextResponse.json({ ok: true, date: today, statuses: {} });
    }

    // 4) Try fetching today's intake events by 'item_id' first.
    let events:
      | Array<{ item_id?: string | null; stack_item_id?: string | null; taken: boolean | null }>
      | null = null;

    let evErr = null;

    {
      const res = await supabase
        .from("intake_events")
        .select("item_id, taken") // preferred schema
        .eq("user_id", userId)
        .eq("intake_date", today)
        .in("item_id", itemIds as string[]);
      events = res.data as any;
      evErr = res.error;
    }

    // 5) Fallback for alternate column name: 'stack_item_id'
    if (evErr?.code === "42703") {
      console.warn("[intake/status] retrying with 'stack_item_id' column");
      const res2 = await supabase
        .from("intake_events")
        .select("stack_item_id, taken")
        .eq("user_id", userId)
        .eq("intake_date", today)
        .in("stack_item_id", itemIds as string[]);
      events = res2.data as any;
      evErr = res2.error;
    }

    if (evErr) {
      console.error("[intake/status] intake_events error:", evErr);
      throw evErr;
    }

    console.log("[intake/status] events", { count: events?.length ?? 0 });

    // 6) Build a stable boolean map for *every* item in the stack
    const map: Record<string, boolean> = {};
    for (const id of itemIds) map[id as string] = false;

    for (const row of events ?? []) {
      const key =
        (row.item_id as string | null | undefined) ??
        (row.stack_item_id as string | null | undefined) ??
        null;
      if (key) map[key] = !!row.taken;
    }

    console.log("[intake/status] done", { keys: Object.keys(map).length });
    return NextResponse.json({ ok: true, date: today, statuses: map });
  } catch (e: any) {
    console.error("[intake/status] unhandled error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "status_failed" }, { status: 500 });
  }
}
