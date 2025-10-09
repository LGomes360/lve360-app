// app/api/intake/status/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  try {
    const { data: userWrap, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userWrap?.user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const userId = userWrap.user.id;

    const url = new URL(req.url);
    const stackId = url.searchParams.get("stack_id");
    if (!stackId) {
      return NextResponse.json({ ok: false, error: "stack_id_required" }, { status: 400 });
    }

    // Today in UTC date (YYYY-MM-DD)
    const today = new Date().toISOString().slice(0, 10);

    // Join stacks_items to limit to items in this stack
    const { data, error } = await supabase
      .from("intake_events")
      .select("item_id, taken")
      .eq("user_id", userId)
      .eq("intake_date", today);

    if (error) throw error;

    // Return a map of item_id -> taken
    const map: Record<string, boolean> = {};
    for (const row of data ?? []) map[row.item_id as string] = !!row.taken;

    return NextResponse.json({ ok: true, date: today, statuses: map });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "status_failed" }, { status: 500 });
  }
}
