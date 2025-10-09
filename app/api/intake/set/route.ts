// app/api/intake/set/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Upsert today's intake event for (user, item)
export async function POST(req: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const { data: userWrap, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userWrap?.user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const userId = userWrap.user.id;

    const body = await req.json();
    const itemId = body?.item_id as string | undefined;
    const taken = body?.taken as boolean | undefined;

    if (!itemId || typeof taken !== "boolean") {
      return NextResponse.json({ ok: false, error: "item_id_and_taken_required" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Upsert (user_id, item_id, intake_date) → taken
    const { error: upErr } = await admin
      .from("intake_events")
      .upsert(
        { user_id: userId, item_id: itemId, intake_date: today, taken },
        { onConflict: "user_id,item_id,intake_date" }
      );

    if (upErr) throw upErr;

    return NextResponse.json({ ok: true, item_id: itemId, date: today, taken });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "set_failed" }, { status: 500 });
  }
}
